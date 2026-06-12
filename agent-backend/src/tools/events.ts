/**
 * 共享事件总线 —— 工具与 Express 路由之间解耦通知
 *
 * 场景：index.ts 注册监听 → 工具写入 spec 后调用 notifySpecChanged()
 * → 立即触发 SSE 推送 → 前端无需手动刷新
 */

type SpecChangeListener = () => void;
const specListeners: SpecChangeListener[] = [];

/** 注册 spec 变更监听（index.ts 调用） */
export function onSpecChanged(fn: SpecChangeListener): void {
  specListeners.push(fn);
}

/** 通知所有监听者 spec 已变更（工具写入后调用） */
export function notifySpecChanged(): void {
  for (const fn of specListeners) {
    try { fn(); } catch {}
  }
}
