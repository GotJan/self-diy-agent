import { DynamicStructuredTool } from '@langchain/core/tools';

// 工具注册表（独立模块，避免循环依赖）
const toolRegistry = new Map<string, DynamicStructuredTool>();

/** 工具注册后的回调（供 index.ts 设置，用于同步到 DB） */
let onToolRegistered: ((tool: DynamicStructuredTool, source: string) => void) | null = null;

export function setToolRegistryCallback(cb: typeof onToolRegistered): void {
  onToolRegistered = cb;
}

/**
 * 注册一个工具
 */
export function registerTool(tool: DynamicStructuredTool, source?: string): void {
  toolRegistry.set(tool.name, tool);
  console.log(`[Tool Registry] Registered: ${tool.name}`);
  if (onToolRegistered) {
    onToolRegistered(tool, source || 'unknown');
  }
}

/**
 * 注销一个工具
 */
export function unregisterTool(toolName: string): boolean {
  const removed = toolRegistry.delete(toolName);
  if (removed) {
    console.log(`[Tool Registry] Unregistered: ${toolName}`);
  }
  return removed;
}

/**
 * 获取所有已注册的工具列表
 */
export function getTools(): DynamicStructuredTool[] {
  return Array.from(toolRegistry.values());
}
