# Self-Diy-Agent (SDA) ✦

<div align="center">
  <img src="assets/1.png" alt="1" />
  <img src="assets/2.png" alt="2" />
  <img src="assets/3.png" alt="3" />
</div>

Self-Diy-Agent | SDA

[English](./README.md)

**「自我定制化-agent，对话即功能，聊出你的操作系统」**

—— 能自己长功能的终端桌面层 Agent，所见即所得，所想即所成。

SDA 是一个能自我生长的 AI 壳层 Agent。你跟它对话，它自己生成 UI 组件、自己配置功能、自己变成你需要的形态——不需要拖拽，不需要写代码。基于 Electron + json-render，一句话生成界面，双击打开一切文件/程序，天然透明窗口，像操作系统一样运行。用任何模型都行——OpenAI、Claude、Gemini，或你自己的端点。切换模型零代码，零锁定。（当前仅接 DeepSeek API，多模型切换规划中）

可以让 AI 创建二次元桌宠，漂浮+跟随鼠标+拖拽扔出+定时提醒！！！

SDA 可以拿去做定制化agent底仓。

SDA 可以拿去做终端桌面agent壳。

Windows（已完成）、macOS、Android 三系统覆盖，可做终端的 AI 定制桌面层。

| 对话即功能 | 理论上能长出任何东西：告诉 AI 你要什么 → 自动生成 json-render spec → 前端实时渲染 UI，秒出功能 |
| --- | --- |
| 二次元桌宠 | 一句话创建 PNG 桌宠，悬浮 + 跟随鼠标 + 拖拽扔出惯性 + 定时提醒气泡 |
| 终端壳层 | Electron frameless 透明窗口，自定义拖拽/缩放/弹窗，完美融入桌面 |
| 文件系统打通 | 浏览本地目录，双击用系统默认程序打开（图片/视频/文档/exe），shell.openPath 一键启动 |
| 自我定制 | AI 自己配 Skill / MCP / API Key / Model，自己长出新能力，不需要写配置文件 |
| 毛玻璃 UI | 全局透明度可调，弹窗悬浮，背景/组件双通道分别控制，和你桌面融为一体 |

---

## 快速启动

### 开发版 | Windows（✅）、macOS、Linux

Git clone 到本地后，把项目目录告诉任意一个已运行的 Agent，让它以 Electron 方式启动就行。

### 安装版 | Windows（✅）

在 [Releases](https://github.com/GotJan/self-diy-agent/releases) 中下载最新 `.exe`，Win10 直接双击安装即可。

启动后在底部输入框对话，让 Agent 生成你的第一个 UI：

```
画一个日历组件
画一下查看 tool 工具列表信息的组件
画一个百度搜索框 可以输入后直接调用百度搜索 并且将搜索结果最近5条展示在搜索框下面
创建一个桌宠组件 C:\Users\Administrator\Desktop\cat.png
```

---

## 命令速查

| 操作 | 方式 |
| --- | --- |
| 生成 UI | 在底部输入框用自然语言描述需求 |
| 弹出为浮动窗口 | 点击组件标题栏 ↗ 按钮 |
| 关闭浮动窗口 | 点击内容区右上角 ✕ |
| 拖拽组件 | 点击组件空白区拖拽；主窗口拖顶部横条 |
| 缩放组件 | 拖拽组件左上角 ↖ 或右下角 ↘ |
| 背景透明度 | 底部右侧滑块调节主区/弹窗背景透明度 |
| 关闭程序 | 主区右上角 ✕ |

---

## 项目结构

```
self-diy-agent/
├── electron/           # Electron 主进程 & preload
│   ├── main.ts         # 窗口创建、后端子进程管理
│   ├── preload.ts      # preload 安全桥接
│   └── database.ts     # SQLite 数据库
├── src/
│   ├── App.tsx         # 主窗口（拖拽/缩放/弹窗/底栏/品牌）
│   ├── components/
│   │   ├── ToolPanel.tsx    # json-render 渲染容器
│   │   └── JsonEditor.tsx   # Spec JSON 编辑器
│   ├── lib/json-render/
│   │   ├── registry.tsx     # UI 组件注册（Card/Button/Table/...）
│   │   └── catalog.ts
│   └── specs/          # AI 生成的 UI spec JSON
├── agent-backend/      # Agent 后端（端口 3001）
│   ├── .env            # API Key / 模型配置
│   └── src/
│       ├── agent.ts    # LangChain StateGraph Agent
│       ├── index.ts    # Express 服务入口（路由/SSE/工具管理）
│       └── tools/      # 19 个工具（sqlite-* / ui-spec-* / current_time 等）
├── 文档/
│   ├── v2迭代计划.md
│   └── 项目路径以及启动.md
├── README.md
└── README.zh-CN.md
```

---

## 技术栈

```
Electron + React 18 + Vite 6 + json-render + LangChain + Express + SQLite
```

| 层 | 技术 |
| --- | --- |
| 前端渲染 | React 18 + json-render 动态 UI 引擎 |
| 桌面壳 | Electron frameless 透明窗口 + IPC |
| Agent 后端 | Express + LangChain Agent 编排 |
| UI 生成 | Agent 生成 JSON → SSE 推送 → 前端自动渲染 |
| 数据 | SQLite（对话历史 / UI spec 持久化） |

---

## Roadmap

| 功能 | 状态 |
| --- | --- |
| Win10 风格文件浏览器（Tree + Breadcrumb + 双击启动） | 计划中 |
| 历史消息持久化 & 会话管理 | 计划中 |
| Skill / MCP / API 配置面板 | 计划中 |
| Agent 通用功能配置 | 计划中 |

详见 [v2 迭代计划](./文档/v2迭代计划.md)

---

## License

MIT — 随便用。如果这个项目帮到了你，愿意的话请作者喝杯咖啡 ☕

> 微信/支付宝赞赏码：放在 `assets/` 目录，README 自动引用

<div align="center">
  <img src="assets/wechat.png" width="180" alt="微信赞赏" />
  &nbsp;&nbsp;
  <img src="assets/alipay.png" width="180" alt="支付宝赞赏" />
</div>
