/**
 * get_ui_spec_rules —— 查看当前支持的 UI 组件白名单
 *
 * 返回所有可用组件的名称、描述和 props 说明。
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const UI_CATALOG = [
  { name: 'Stack', description: 'Flex layout container', props: 'direction?: "row"|"column", gap?: number; slot: default' },
  { name: 'Card', description: 'Card container', props: 'title?: string, description?: string; slot: default' },
  { name: 'Heading', description: 'Heading text', props: 'text: string, level?: "h1"|"h2"|"h3"|"h4"' },
  { name: 'Text', description: 'Paragraph text', props: 'text: string' },
  { name: 'Input', description: 'Text input field (value 必须用 $bindState 写在 props 内)', props: 'label: string, name: string, placeholder?: string, value: { "$bindState": "/form/字段名" }, type?: "text"|"email"|"password"|"number"|"url"' },
  { name: 'Button', description: 'Clickable button (必须加 "on": { "press": { "action": "submit", "params": { "form": { "$state": "form" } } } })', props: 'label: string, variant?: "primary"|"secondary"|"outline", size?: "sm"|"md"|"lg" | on: { press: { action: "submit", params: { form: { $state: "form" } } } }' },
  { name: 'Select', description: 'Dropdown select (value 必须用 $bindState 写在 props 内)', props: 'label: string, name: string, options: {label:string,value:string}[], placeholder?: string, value: { "$bindState": "/form/字段名" }' },
  { name: 'Switch', description: 'Toggle switch (checked 必须用 $bindState 写在 props 内)', props: 'label: string, name: string, checked: { "$bindState": "/form/字段名" }' },
  { name: 'Separator', description: 'Visual divider line', props: '(none)' },
  { name: 'List', description: 'Ordered or unordered list', props: 'ordered?: boolean, items?: string[]; slot: default' },
  { name: 'ListItem', description: 'Single list item', props: 'text?: string; slot: default' },
  { name: 'Image', description: 'Image display', props: 'src: string, alt?: string, width?: number, height?: number, fit?: "cover"|"contain"|"fill"' },
  { name: 'CodeBlock', description: 'Syntax-highlighted code block', props: 'code: string, language?: string, showLineNumbers?: boolean' },
  { name: 'Markdown', description: 'Markdown content renderer', props: 'content: string' },
  { name: 'Link', description: 'Hyperlink', props: 'href: string, text: string, target?: "_self"|"_blank"' },
  { name: 'Badge', description: 'Small status badge or tag', props: 'text: string, color?: "gray"|"green"|"red"|"yellow"|"blue"|"purple", size?: "sm"|"md"' },
  { name: 'Table', description: 'Data table', props: 'columns: {key:string,label:string}[], rows: {}[], striped?: boolean' },
  { name: 'DatePicker', description: 'Date picker input', props: 'label: string, name: string, value?: string, min?: string, max?: string, placeholder?: string' },
  { name: 'FloatSprite', description: '⭐ 可拖拽漂浮精灵（桌宠）。本地图片用绝对路径。PNG 透明最佳。支持：定时提醒气泡、跟随鼠标、扔出惯性+碰撞反弹。⚠️ 使用定时提醒时，reminderInterval 和 reminderMessages 必须同时传入，缺一则提醒不生效！', props: 'src: string (绝对路径), width?: number, alt?: string, floatRange?: number, reminderInterval?: number (定时提醒间隔毫秒，如 15000=15秒。传了 reminderMessages 时必须传此参数！), reminderMessages?: string[], followMouse?: boolean, followSpeed?: number (默认0.04), throwEnabled?: boolean | bindings.position: 持久化拖拽位置' },
];

const ACTIONS = [
  { name: 'submit', description: 'Submit form', params: 'formId?: string' },
  { name: 'reset', description: 'Reset form', params: '(none)' },
];

const SPEC_ACTIONS = [
  {
    type: 'url',
    description: '提交时打开一个 URL，支持 {fieldName} 占位符替换表单字段值',
    example: { submit: { type: 'url', url: 'https://www.baidu.com/s?wd={keyword}' } },
  },
  {
    type: 'fetch',
    description: '提交时 POST 到指定 API 地址，前端会传 { specName, actionName, formData }',
    example: { submit: { type: 'fetch', endpoint: 'http://localhost:3001/api/action', method: 'POST' } },
  },
  {
    type: 'agent',
    description: '⭐推荐⭐ 闭环交互！点击按钮后前端自动 POST http://localhost:3001/api/action，参数 { specName, actionName, formData: {字段名: 值} }。后端 Agent 收到数据后自动搜索/查询，再调用 update_ui_spec 写回结果，SSE 推送前端刷新渲染。搜索/查询类 UI 必用！',
    example: { submit: { type: 'agent' } },
  },
];

export const getUiSpecRulesTool = tool(
  () => ({
    components: UI_CATALOG,
    actions: ACTIONS,
    specActions: SPEC_ACTIONS,
    usage: `每个组件在 JSON 中用 { "type": "ComponentName", "props": {...}, "children": [...] } 表示。有 slot 的组件可嵌套子组件。

⚠️ 重要规则（必须遵守）：
1. Button 元素必须加 "on": { "press": { "action": "submit", "params": { "form": { "$state": "form" } } } } 才能触发 action 并传表单数据！
   例: { "type": "Button", "props": { "label": "搜索" }, "on": { "press": { "action": "submit", "params": { "form": { "$state": "form" } } } } }
2. 有 Button → 必传 actions 参数！格式：actions='{ "submit": { "type": "url"|"fetch"|"agent", ... } }'
3. 有 Input/Select/Switch → 必传 initialState 参数！格式：initialState='{ "form": { "字段名": "" } }'
   ★ 绑定语法（关键！不是顶层 bindings，是 props 内 $bindState！）：
   - Input/Select: props 内写 "value": { "$bindState": "/form/字段名" }
   - Switch: props 内写 "checked": { "$bindState": "/form/字段名" }
   ❌ 错误写法（不生效！）: "bindings": { "value": "form.字段名" }  ← 顶层 bindings 库不识别
   ✅ 正确写法: props: { "value": { "$bindState": "/form/keyword" } }  ← $bindState 必须在 props 内
   ★ 路径必须用 JSON Pointer 格式 /form/keyword（斜杠分隔），不能用 form.keyword（点分隔）
4. 搜索/查询类 UI → actions 用 "agent" 类型！Agent 收到表单数据自动搜索 → update_ui_spec 写回结果 → 前端刷新

★ 使用 create_tool 生成工具代码时：代码会通过 eval() 执行，必须是纯 JavaScript，不能包含 TypeScript 类型注解！
   ❌ 错误: export async function run(params: any) { ... } catch (error: any) { ... }
   ✅ 正确: export async function run(params) { ... } catch (error) { ... }
   ❌ 错误: const x: string = 'hello';
   ✅ 正确: const x = 'hello';
   ❌ 错误: ): Promise<any> {  ← 返回类型注解
   ✅ 正确: ) {
   记住：不要写 :any, :string, :number, :boolean, :Promise<...>, :Error 等类型注解！纯 JS only！

specActions 三种类型：
- url: 打开URL，{fieldName} 替换表单值，例 { submit: { type: "url", url: "https://www.baidu.com/s?wd={keyword}" } }
- fetch: POST 到 endpoint，前端传 { specName, actionName, formData }
- agent: ⭐推荐⭐ 前端自动 POST /api/action，Agent 搜数据→更新spec→SSE刷新，搜索/查询必用！`,
  }),
  {
    name: 'get_ui_spec_rules',
    description:
      '查询当前所有可用的 UI 组件白名单。返回每个组件的名称、描述和 props 说明。创建 UI spec 前必调。',
    schema: z.object({}),
  }
);
