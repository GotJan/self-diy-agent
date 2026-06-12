import { ChatOpenAI } from '@langchain/openai';
import { getEnabledTools, refreshEnabledToolSet } from './tools/index.js';
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { StateGraph, END } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';

// ========== SSE 事件类型 ==========

export type StreamEvent =
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; toolName: string; args: Record<string, any> }
  | { type: 'tool_result'; toolName: string; result: string }
  | { type: 'answer'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

let eventCallback: ((event: StreamEvent) => void) | null = null;

export function setEventCallback(cb: typeof eventCallback) {
  eventCallback = cb;
}

function emit(event: StreamEvent) {
  eventCallback?.(event);
  switch (event.type) {
    case 'reasoning':
      console.log(`[Agent] 🤔 ${event.content.slice(0, 150)}...`);
      break;
    case 'tool_call':
      console.log(`[Agent] 🔧 Calling: ${event.toolName}`, JSON.stringify(event.args).slice(0, 100));
      break;
    case 'tool_result':
      console.log(`[Agent] ✅ Result from ${event.toolName}:`, event.result.slice(0, 200));
      break;
    case 'answer':
      console.log(`[Agent] 💬 Answer:`, event.content.slice(0, 200));
      break;
  }
}

// ========== 模型初始化 (支持动态 API Key + 推理强度) ==========

let currentApiKey: string | undefined;
let currentReasoningEffort: string | undefined;

export function setApiKey(key: string | undefined) {
  currentApiKey = key;
}

function getModel() {
  const apiKey = currentApiKey || process.env.OPENAI_API_KEY;
  const effort = currentReasoningEffort || process.env.DEEPSEEK_REASONING_EFFORT || 'high';
  console.log('[Model] 使用 API Key 前缀:', apiKey ? apiKey.slice(0, 8) + '...' : '(无)', '| reasoning:', effort);
  return new ChatOpenAI({
    apiKey,
    modelName: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
    },
    modelKwargs: {
      reasoning_effort: effort,
      extra_body: {
        thinking: { type: 'enabled' },
      },
    },
    __includeRawResponse: true,
  });
}

// ========== 消息预处理 ==========

function ensureReasoningContent(messages: Array<any>): Array<any> {
  return messages.map((msg) => {
    if (msg._getType?.() !== 'ai') return msg;
    const reasoning = msg.additional_kwargs?.reasoning_content;
    if (!reasoning) return msg;
    if (msg.tool_calls?.length) {
      return new AIMessage({
        content: msg.content || '',
        tool_calls: msg.tool_calls,
        additional_kwargs: { ...msg.additional_kwargs, reasoning_content: reasoning },
        id: msg.id,
      });
    }
    return msg;
  });
}

// ========== 最后一轮 Token ==========

let lastRoundTokens = 0;

function extractTokens(response: any): number {
  const usage = response.usage_metadata;
  if (usage?.total_tokens) return usage.total_tokens;
  const tokenUsage = response.response_metadata?.tokenUsage;
  return tokenUsage?.totalTokens || 0;
}

// ========== Graph 节点 ==========

async function callModel(state: typeof MessagesAnnotation.State) {
  // 每轮对话前从 DB 刷新启用的工具列表
  await refreshEnabledToolSet();
  const tools = getEnabledTools();
  const llmWithTools = getModel().bindTools(tools);
  const processedMessages = ensureReasoningContent(state.messages);
  const response = await llmWithTools.invoke(processedMessages);

  // 推送思考内容（每轮必发，从原始响应中提取）
  const raw = (response as any).additional_kwargs?.__raw_response;
  const reasoning = raw?.choices?.[0]?.message?.reasoning_content;
  if (reasoning) {
    emit({ type: 'reasoning', content: reasoning });
  } else if (response.tool_calls?.length) {
    const toolNames = response.tool_calls.map((tc: any) => tc.name).join(', ');
    emit({ type: 'reasoning', content: `即将调用: ${toolNames}` });
  } else {
    emit({ type: 'reasoning', content: '生成回答...' });
  }

  // 推送工具调用
  if (response.tool_calls?.length) {
    for (const tc of response.tool_calls) {
      emit({ type: 'tool_call', toolName: tc.name, args: tc.args as Record<string, any> });
    }
  } else {
    // 没有 tool_calls → 这是最后一轮，记录 token
    lastRoundTokens = extractTokens(response);
  }

  return { messages: [response] };
}

async function executeDynamicTool(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];
  if (toolCalls.length === 0) return { messages: [] };

  const tools = getEnabledTools();
  const messages: ToolMessage[] = [];

  for (const tc of toolCalls) {
    const tool = tools.find((t) => t.name === tc.name);
    if (!tool) {
      const errMsg = `Error: Tool '${tc.name}' not found`;
      emit({ type: 'tool_result', toolName: tc.name, result: errMsg });
      messages.push(new ToolMessage({ content: errMsg, tool_call_id: tc.id! }));
      continue;
    }

    try {
      const output = await tool.invoke(tc.args);
      const resultStr = typeof output === 'string' ? output : JSON.stringify(output);
      emit({ type: 'tool_result', toolName: tc.name, result: resultStr });
      messages.push(new ToolMessage({ content: resultStr, tool_call_id: tc.id! }));
    } catch (err: any) {
      const errMsg = `Error: ${err.message}`;
      emit({ type: 'tool_result', toolName: tc.name, result: errMsg });
      messages.push(new ToolMessage({ content: errMsg, tool_call_id: tc.id! }));
    }
  }

  return { messages };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  return lastMessage.tool_calls?.length ? 'execute_tool' : END;
}

// ========== 构建 Graph ==========

const graph = new StateGraph(MessagesAnnotation)
  .addNode('call_model', callModel)
  .addNode('execute_tool', executeDynamicTool)
  .addEdge('__start__', 'call_model')
  .addEdge('execute_tool', 'call_model')
  .addConditionalEdges('call_model', shouldContinue)
  .compile();

// ========== 执行 Agent ==========

export async function runAgent(message: string, apiKey?: string, reasoningEffort?: string) {
  if (apiKey) setApiKey(apiKey);
  currentReasoningEffort = reasoningEffort;
  lastRoundTokens = 0;
  try {
    const result = await graph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      { recursionLimit: 50 }
    );

    const aiMessages = result.messages.filter(
      (m) => m._getType() === 'ai' && m.content
    );
    const lastAiMessage = aiMessages[aiMessages.length - 1];

    const finalContent = lastAiMessage?.content || '';
    if (finalContent) {
      const prefix = lastRoundTokens > 0
        ? `[${lastRoundTokens.toLocaleString()}/1M Token] `
        : '';
      emit({ type: 'answer', content: prefix + finalContent });
    }

    const toolCalls = result.messages
      .filter((m) => m._getType() === 'tool')
      .map((m: any) => ({
        tool: m.name,
        input: m.tool_call_id,
        output: m.content,
      }));

    emit({ type: 'done' });

    return { output: finalContent, toolCalls };
  } catch (err: any) {
    emit({ type: 'error', message: err.message });
    emit({ type: 'done' });
    throw err;
  } finally {
    currentReasoningEffort = undefined; // 重置，避免泄漏到下次调用
  }
}
