import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { runAgent, setEventCallback } from './agent.js';
import { getTools, registerTool, autoLoadTools, setToolRegistryCallback, refreshEnabledToolSet, markToolEnabled } from './tools/index.js';
import { getDb } from './tools/sqlite-db.js';
import { initDatabase } from './tools/sqlite-db.js';
import { SPECS_DIR } from './tools/utils.js';
import { onSpecChanged, notifySpecChanged } from './tools/events.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ========== 状态推送 ==========

let currentStatus = '🟢 服务已启动';
const statusClients = new Set<express.Response>();

function broadcastStatus(text: string) {
  currentStatus = text;
  console.log(`[Status] ${text}`);
  const data = JSON.stringify({ status: text });
  for (const client of statusClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      statusClients.delete(client);
    }
  }
}

// SSE 状态端点（连接后立即发送当前状态，后续有更新时推送）
app.get('/api/status/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 立即发送当前状态
  res.write(`data: ${JSON.stringify({ status: currentStatus })}\n\n`);

  statusClients.add(res);
  req.on('close', () => statusClients.delete(res));
});

// ========== 对话接口 ==========
app.post('/api/chat/stream', async (req, res) => {
  const { message, apiKey } = req.body;
  console.log('[Chat] 收到请求, apiKey 前缀:', apiKey ? apiKey.slice(0, 8) + '...' : '(未传)');

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  // SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 注册事件回调 → 推送到 SSE
  setEventCallback((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  try {
    await runAgent(message, apiKey);
  } catch (error: any) {
    // 错误已在 runAgent 内通过 emit 发送
  } finally {
    setEventCallback(null);
    res.end();
  }
});

// 对话接口（非流式，保留兼容）
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await runAgent(message);
    res.json({
      answer: result.output,
      toolCalls: result.toolCalls,
    });
  } catch (error: any) {
    console.error('Agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 本地文件代理：读取本地图片/文件，返回二进制流（绕过 Electron file:// 限制）
app.get('/api/files', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: '?path= required' });

  // 安全检查：只允许绝对路径，拒绝相对路径
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: `File not found: ${absPath}` });
  }

  // 根据扩展名设置 Content-Type
  const ext = path.extname(absPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  };
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const buf = fs.readFileSync(absPath);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 关闭服务（供 Electron 退出时调用）
app.post('/api/shutdown', (_req, res) => {
  res.json({ ok: true });
  console.log('[Server] 收到关闭指令，即将退出...');
  process.exit(0);
});

// ========== 交互 Action 端点 ==========
// 前端 UI 交互触发：点击按钮 → POST 到此 → Agent 搜索/更新 spec → SSE 推送刷新
app.post('/api/action', async (req, res) => {
  const { specName, actionName, apiKey } = req.body;
  console.log(`[Action] spec=${specName}, action=${actionName}, apiKey=${apiKey ? apiKey.slice(0, 8) + '...' : '(空/未传)'}`);
  let formData: any = {};
  const specPath = path.join(SPECS_DIR, `${specName}.json`);
  if (fs.existsSync(specPath)) {
    try {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
      formData = (spec.data || spec).initialState?.form || {};
    } catch {}
  }
  console.log(`[Action] spec=${specName}, action=${actionName}, formData(from file)=`, formData);

  // 读取当前 spec 结构，让 Agent 知道它有什么元素
  let specInfo = '';
  if (fs.existsSync(specPath)) {
    try {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
      const data = spec.data || spec;
      const elIds = data.elements ? Object.keys(data.elements) : [];
      const elSummary = (data.elements
        ? Object.entries(data.elements).map(([id, el]: [string, any]) =>
            `  - ${id}: ${el.type} (props: ${JSON.stringify(el.props || {})})`)
        : []).join('\n');
      specInfo = `当前 spec 结构（共 ${elIds.length} 个元素，root="${data.root}"）：\n${elSummary}`;
    } catch {}
  }

  const prompt = [
    `用户在前端 UI 组件 **${specName}** 上触发了 **${actionName}** 操作，`,
    `提交了以下数据:\n`,
    '```json\n' + JSON.stringify(formData || {}, null, 2) + '\n```\n',
    specInfo ? `\n${specInfo}\n` : '',
    '\n请执行以下步骤：\n',
    '1. 根据用户提交的数据，调用相关工具进行搜索或查询（如 Baidu 搜索等）\n',
    '2. 调用 update_ui_spec(name="' + specName + '", ...) 或 update_ui_data 更新结果区的元素（如 result-1~result-5 的 Card 的 title 和 description）\n',
    '3. 更新完成后简要告知用户（无需详细展示所有结果）',
  ].join('');

  try {
    const result = await runAgent(prompt, apiKey, 'low'); // action 不需要深度思考，快速响应
    console.log(`[Action] ${specName}/${actionName} 处理完成`);
    res.json({ ok: true, message: '处理完成', output: result?.output?.slice(0, 200) });
  } catch (error: any) {
    console.error(`[Action] ${specName}/${actionName} 处理失败:`, error.message);
    res.json({ ok: false, error: error.message || 'Agent 处理失败' });
  }
});

// ⭐ 实时写入表单值到 spec 文件的 initialState
// 前端 Input 每次打字都会调用此接口，保证数据落盘
// ⚠️ 必须写入 data.initialState（前端解包用的是 spec.data），而非顶层 initialState
app.post('/api/specs/set-initial-state', (req, res) => {
  const { specName, path: statePath, value } = req.body;
  const specFile = path.join(SPECS_DIR, `${specName}.json`);
  if (!fs.existsSync(specFile)) {
    return res.status(404).json({ ok: false, error: 'Spec not found' });
  }
  try {
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
    // 定位到 data.initialState（前端 JSONUIProvider 使用 initialState 从这里读取）
    if (!spec.data) spec.data = {};
    if (!spec.data.initialState) spec.data.initialState = {};
    // 写入值：支持嵌套路径如 "form.keyword"
    const keys = statePath.split('.');
    let target = spec.data.initialState;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]] || typeof target[keys[i]] !== 'object') {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 2), 'utf-8');
    notifySpecChanged();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== Specs 接口 ==========

// 获取所有 spec 文件的完整数据
app.get('/api/specs', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const specs: Record<string, any> = {};
  if (fs.existsSync(SPECS_DIR)) {
    const files = fs.readdirSync(SPECS_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(SPECS_DIR, f), 'utf-8');
        specs[f.replace('.json', '')] = JSON.parse(raw);
      } catch {}
    }
  }
  res.json({ specs, count: Object.keys(specs).length });
});

// SSE 监听 specs 目录变更
let specsWatcher: fs.FSWatcher | null = null;
const specsWatchClients = new Set<express.Response>();

function broadcastSpecsChanged() {
  const data = JSON.stringify({ type: 'changed', ts: Date.now() });
  for (const client of specsWatchClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      specsWatchClients.delete(client);
    }
  }
}

// 工具写入 spec 后主动通知 SSE 推送（不依赖 fs.watch）
onSpecChanged(() => broadcastSpecsChanged());

app.get('/api/specs/watch', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  specsWatchClients.add(res);
  req.on('close', () => specsWatchClients.delete(res));

  // 启动文件监听（只启动一次）
  if (!specsWatcher && fs.existsSync(SPECS_DIR)) {
    specsWatcher = fs.watch(SPECS_DIR, (_event, _filename) => {
      broadcastSpecsChanged();
    });
  }

  // 立即推送一次
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
});

// 查看已注册的工具
app.get('/api/tools', (_req, res) => {
  const tools = getTools();
  res.json({
    count: tools.length,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
});

// 动态注册工具（示例：运行时添加新工具）
app.post('/api/tools/register', (req, res) => {
  const { name, description, schema, handler } = req.body;

  if (!name || !description || !handler) {
    return res.status(400).json({ error: 'name, description, and handler are required' });
  }

  try {
    // 创建动态工具
    const dynamicTool = new DynamicStructuredTool({
      name,
      description,
      schema: z.object(schema || {}),
      func: async (input) => {
        // 这里可以调用外部函数或执行代码
        return typeof handler === 'function' ? handler(input) : String(handler);
      },
    });

    registerTool(dynamicTool);
    res.json({ message: `Tool '${name}' registered successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Agent backend running on http://localhost:${PORT}`);

  // 确保 specs 目录存在
  if (!fs.existsSync(SPECS_DIR)) {
    fs.mkdirSync(SPECS_DIR, { recursive: true });
    console.log(`[Init] specs 目录已创建: ${SPECS_DIR}`);
  }

  // 初始化 sql.js (异步加载 WASM)
  await initDatabase();

  // 初始化 SQLite tools 表
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tools (
      name        TEXT PRIMARY KEY,
      description TEXT,
      source      TEXT,
      loaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
      enabled     INTEGER NOT NULL DEFAULT 1
    )
  `);
  // 兼容旧表：无 enabled 列时补上
  try {
    db.exec(`ALTER TABLE tools ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`);
  } catch { /* 列已存在则忽略 */ }
  console.log('[Init] tools 表已就绪');

  // 注册回调：工具注册/动态创建时同步到 DB + 即时更新内存启用集
  setToolRegistryCallback((tool, source) => {
    try {
      db.prepare(
        `INSERT OR REPLACE INTO tools (name, description, source, loaded_at, enabled)
         VALUES (?, ?, ?, datetime('now'), 1)`
      ).run(tool.name, tool.description || '', source);
      // 即时更新内存启用集，不等下一轮 refreshEnabledToolSet
      markToolEnabled(tool.name);
      console.log(`[Tools DB] ${tool.name} ← ${source}`);
    } catch (err: any) {
      console.error(`[Tools DB] Failed to sync ${tool.name}:`, err.message);
    }
  });

  // 自动加载所有工具（每次 registerTool 都会触发回调写入 DB）
  await autoLoadTools();
  await refreshEnabledToolSet(); // 初始化启用缓存
  console.log(`[Init] 共加载 ${getTools().length} 个工具`);

  // 模拟启动初始化过程（每秒推送一条）
  const initSteps = [
    '⏳ Agent 引擎初始化中...',
    '📦 加载工具注册表...',
    '🔧 预置工具: current_time',
    '🔧 预置工具: 创世工具',
    '🤖 连接 DeepSeek 模型...',
    '✅ Agent 已运行，等待输入...',
  ];

  let i = 0;
  const timer = setInterval(() => {
    if (i < initSteps.length) {
      broadcastStatus(initSteps[i]);
      i++;
    } else {
      clearInterval(timer);
    }
  }, 1000);
});
