import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolPanel } from './components/ToolPanel';
import type { Spec } from '@json-render/react';

function App() {
  // 浮动窗口模式：URL ?floating=specName
  const floatingSpecName = new URLSearchParams(window.location.search).get('floating');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('🔄 连接中...');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<string[]>(['🔄 连接中...']);
  const [showHistory, setShowHistory] = useState(false);
  const [specs, setSpecs] = useState<Record<string, Spec>>({});
  const [specOrder, setSpecOrder] = useState<string[]>([]);
  // 浮动卡片：每个 spec 的位置和层级
  const [cardPos, setCardPos] = useState<Record<string, { x: number; y: number; z: number }>>({});
  const [cardSize, setCardSize] = useState<Record<string, { w: number; h: number }>>({});
  const zCounter = useRef(10);
  // 拖拽/缩放状态（用 ref 避免频繁渲染）
  const dragRef = useRef<{ name: string; sx: number; sy: number; mx: number; my: number } | null>(null);
  const resizeRef = useRef<{ name: string; sx: number; sy: number; sw: number; sh: number; mx: number; my: number; corner: 'tl' | 'br' } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{ text: string; x: number; y: number } | null>(null);
  const [floatingSpecs, setFloatingSpecs] = useState<Set<string>>(new Set());
  const [bgOpacity, setBgOpacity] = useState(0);
  const [compOpacity, setCompOpacity] = useState(0.72);
  const historyRef = useRef<HTMLDivElement>(null);
  const specHashes = useRef<Record<string, string>>({});

  // 更新状态（同时记录历史）
  const updateStatus = useCallback((s: string) => {
    setStatus(s);
    setStatusHistory((prev) => {
      const next = [...prev, s];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  // 连接后端状态 SSE，只展示最新一行
  useEffect(() => {
    const es = new EventSource('http://localhost:3001/api/status/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status) updateStatus(data.status);
      } catch {}
    };
    es.onerror = () => updateStatus('⚠️ 状态连接断开');
    return () => es.close();
  }, []);

  // 监听 specs 目录变更 + 加载渲染
  useEffect(() => {
    const fetchSpecs = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/specs');
        const data = await res.json();
        const specs = data.specs || {};
        // 解包 data 包装，兼容两种格式
        const unwrapped: Record<string, Spec> = {};
        for (const [k, v] of Object.entries(specs)) {
          unwrapped[k] = ((v as any).data || v) as Spec;
        }
        setSpecs((prev) => {
          // 避免相同内容导致不必要的重渲染（保护输入框状态）
          if (JSON.stringify(prev) === JSON.stringify(unwrapped)) return prev;
          return unwrapped;
        });
        // 维护顺序：新文件追加到末尾，删除的移除
        setSpecOrder((prev) => {
          const newKeys = Object.keys(unwrapped);
          const filtered = prev.filter((k) => newKeys.includes(k));
          const added = newKeys.filter((k) => !prev.includes(k));
          return [...filtered, ...added];
        });
      } catch {}
    };

    // 首次加载
    fetchSpecs();

    // SSE 监听目录变更
    const es = new EventSource('http://localhost:3001/api/specs/watch');
    es.onmessage = () => fetchSpecs();
    es.onerror = () => {};
    return () => es.close();
  }, []);

  // 监听浮动窗口关闭
  useEffect(() => {
    const unsub = window.electronAPI?.onFloatingClosed((specName: string) => {
      setFloatingSpecs((prev) => {
        const next = new Set(prev);
        next.delete(specName);
        return next;
      });
    });
    return unsub;
  }, []);

  const handleSend = useCallback(async () => {
    const msg = message.trim();
    if (!msg || loading) return;
    setMessage('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:3001/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, apiKey: apiKey || undefined }),
      });

      if (!res.ok) {
        setError(`请求失败 (${res.status}): ${res.statusText}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 最后一个可能不完整，保留
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              switch (event.type) {
                case 'reasoning':
                  updateStatus('🤔 ' + ((event as any).content || '思考中...').slice(0, 70));
                  break;
                case 'tool_call':
                  updateStatus(`🔧 调用工具: ${event.toolName}`);
                  break;
                case 'tool_result':
                  updateStatus('✅ ' + ((event as any).result || '').slice(0, 120));
                  break;
                case 'answer':
                  updateStatus('💬 ' + (event.content || '').slice(0, 80));
                  break;
                case 'error':
                  setError(event.message || '未知错误');
                  break;
                case 'done':
                  // 流结束
                  break;
              }
            } catch { /* 解析失败的行跳过 */ }
          }
        }
      }
    } catch (err: any) {
      setError(`连接错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [message, loading, apiKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ===== 浮动卡片拖拽 =====
  // 新卡片默认位置错开
  const defaultPos = (i: number) => ({
    x: 40 + (i % 3) * 30,
    y: 20 + (i % 3) * 30,
    z: ++zCounter.current,
  });

  const bringToFront = useCallback((name: string) => {
    zCounter.current += 1;
    setCardPos((prev) => ({
      ...prev,
      [name]: { ...(prev[name] || defaultPos(0)), z: zCounter.current },
    }));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, name: string) => {
    // 跳过交互元素（按钮、输入框、文本域、下拉、链接等）
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [data-float-sprite]')) return;
    e.preventDefault();
    bringToFront(name);
    const pos = cardPos[name] || { x: 0, y: 0 };
    dragRef.current = { name, sx: pos.x, sy: pos.y, mx: e.clientX, my: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [cardPos, bringToFront]);

  const onResizeStart = useCallback((e: React.PointerEvent, name: string, corner: 'tl' | 'br') => {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(name);
    const pos = cardPos[name] || { x: 0, y: 0 };
    const sz = cardSize[name] || { w: 0, h: 0 };
    resizeRef.current = {
      name, corner,
      sx: pos.x, sy: pos.y,
      sw: sz.w, sh: sz.h,
      mx: e.clientX, my: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [cardPos, cardSize, bringToFront]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        const { name, sx, sy, mx, my } = dragRef.current;
        setCardPos((prev) => ({
          ...prev,
          [name]: { ...(prev[name] || { x: 0, y: 0 }), x: sx + e.clientX - mx, y: sy + e.clientY - my },
        }));
      }
      if (resizeRef.current) {
        const { name, sx, sy, sw, sh, mx, my, corner } = resizeRef.current;
        const dx = e.clientX - mx;
        const dy = e.clientY - my;
        const minW = 220;
        const minH = 100;
        if (corner === 'br') {
          setCardSize((prev) => ({
            ...prev,
            [name]: { w: Math.max(minW, sw + dx), h: Math.max(minH, sh + dy) },
          }));
        } else {
          // top-left: adjust position AND size
          const newW = Math.max(minW, sw - dx);
          const newH = Math.max(minH, sh - dy);
          setCardPos((prev) => ({
            ...prev,
            [name]: { ...(prev[name] || { x: 0, y: 0 }), x: sx + dx + (sw - newW), y: sy + dy + (sh - newH) },
          }));
          setCardSize((prev) => ({
            ...prev,
            [name]: { w: newW, h: newH },
          }));
        }
      }
    };
    const onUp = () => { dragRef.current = null; resizeRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // ========== 浮动窗口模式 ==========
  if (floatingSpecName) {
    const spec = specs[floatingSpecName];
    return (
      <div
        onMouseEnter={(e) => {
          const inner = e.currentTarget.firstElementChild as HTMLElement;
          if (inner) inner.style.boxShadow = '0 0 0 1px rgba(99,102,241,0.25), 0 4px 24px rgba(0,0,0,0.12)';
        }}
        onMouseLeave={(e) => {
          const inner = e.currentTarget.firstElementChild as HTMLElement;
          if (inner) inner.style.boxShadow = 'none';
        }}
        style={{
          width: '100vw',
          height: '100vh',
          padding: 6,
          background: 'transparent',
          boxSizing: 'border-box',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: `rgba(255,255,255,${bgOpacity})`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            WebkitAppRegion: 'no-drag',
            transition: 'box-shadow 0.25s',
          } as React.CSSProperties}
        >
          {/* 内容 + X 关闭 */}
          <div
            style={{ flex: 1, overflow: 'auto', position: 'relative', cursor: 'grab' }}
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button, input, textarea, select, a, [data-float-sprite]')) return;
              e.preventDefault();
              const mx = e.clientX, my = e.clientY;
              const onMove = (ev: PointerEvent) => {
                window.electronAPI?.moveWindowBy(ev.clientX - mx, ev.clientY - my);
              };
              const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            }}
          >
            {spec ? (
              <ToolPanel spec={spec} compOpacity={compOpacity} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#999',
                  fontSize: 14,
                }}
              >
                加载中...
              </div>
            )}
            <button
              onClick={() => window.electronAPI?.closeFloatingSelf()}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: 6,
                background: 'rgba(0,0,0,0.04)',
                color: '#999',
                fontSize: 13,
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
                zIndex: 10,
                transition: 'background 0.15s, color 0.15s',
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#999'; }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 错误弹窗 */}
      {error && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
            zIndex: 9999,
          }}
          onClick={() => setError(null)}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '90%',
              padding: '24px',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#d32f2f' }}>执行出错</span>
            </div>
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#fff3f3',
                border: '1px solid #ffcdd2',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#c62828',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '200px',
                overflowY: 'auto',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              style={{
                width: '100%',
                padding: '10px 0',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#d32f2f',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 主要内容区域 — specs 浮动渲染 */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: `rgba(255,255,255,${bgOpacity})`,
        }}
      >
        {/* 右上角窗口控制按钮 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 6,
          gap: 4,
          zIndex: 100,
          WebkitAppRegion: 'drag',
          cursor: 'grab',
        } as React.CSSProperties}>
          <button
            onClick={() => window.electronAPI?.minimizeWindow()}
            title="最小化"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', borderRadius: 4,
              background: 'rgba(0,0,0,0.04)', color: '#999',
              fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 0,
              transition: 'background 0.15s, color 0.15s',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = '#333'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#999'; }}
          >
            −
          </button>
          <button
            onClick={() => window.electronAPI?.toggleMaximize()}
            title="最大化/还原"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', borderRadius: 4,
              background: 'rgba(0,0,0,0.04)', color: '#999',
              fontSize: 12, cursor: 'pointer', lineHeight: 1, padding: 0,
              transition: 'background 0.15s, color 0.15s',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = '#333'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#999'; }}
          >
            □
          </button>
          <button
            onClick={() => window.electronAPI?.quitApp()}
            title="关闭"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', borderRadius: 4,
              background: 'rgba(0,0,0,0.04)', color: '#999',
              fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 0,
              transition: 'background 0.15s, color 0.15s',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#999'; }}
          >
            ✕
          </button>
        </div>
        {Object.keys(specs).length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#6366f1', marginBottom: 4, letterSpacing: '-0.02em' }}>
              Self-Diy-Agent
            </div>
            <div style={{ fontSize: '16px', color: '#555', fontWeight: 600, marginBottom: 6 }}>
              「自我定制化-agent，对话即功能，聊出你的操作系统」
            </div>
            <div style={{ fontSize: '13px', color: '#999', lineHeight: 1.7, textAlign: 'center', maxWidth: '460px' }}>
              —— 能自己长功能的终端桌面层 Agent，所见即所得，所想即所成。
            </div>
          </div>
        )}
        {specOrder.map((name, i) => {
          const spec = specs[name];
          if (!spec) return null;
          if (floatingSpecs.has(name)) return null;
          const pos = cardPos[name] || defaultPos(i);
          const sz = cardSize[name] || { w: 0, h: 0 };
          return (
            <div
              key={name}
              onPointerDown={(e) => onPointerDown(e, name)}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                zIndex: pos.z,
                userSelect: 'none',
              }}
            >
              {/* 标题栏（可拖拽） */}
              <div
                data-card-header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  color: '#666',
                  padding: '5px 10px',
                  background: 'transparent',
                  borderRadius: '10px 10px 0 0',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderBottom: 'none',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  cursor: 'grab',
                }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).tagName === 'BUTTON') return;
                  e.currentTarget.style.cursor = 'grabbing';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.cursor = 'grab';
                }}
              >
                {/* 左上角缩放箭头 */}
                <div
                  onPointerDown={(e) => onResizeStart(e, name, 'tl')}
                  title="缩放"
                  style={{
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'nwse-resize',
                    color: '#aaa',
                    fontSize: 13,
                    lineHeight: 1,
                    borderRadius: 3,
                    transition: 'color 0.15s, background 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.transform = 'scale(1.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  ↖
                </div>
                <span style={{ flex: 1 }} />
                <button
                  title="弹出为浮动窗口"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.openFloatingSpec(name);
                    setFloatingSpecs((prev) => new Set(prev).add(name));
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    borderRadius: 4,
                    background: 'transparent',
                    color: '#aaa',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'transparent'; }}
                >
                  ↗
                </button>
              </div>
              {/* 内容区域 + 右下角缩放把手 */}
              <div
                onClick={() => bringToFront(name)}
                style={{ position: 'relative', cursor: 'grab', width: sz.w || undefined, height: sz.h || undefined }}
              >
                {(() => {
                  const hash = JSON.stringify(spec);
                  const prev = specHashes.current[name];
                  if (prev !== hash) specHashes.current[name] = hash;
                  return <ToolPanel key={`${name}-${(prev || hash).slice(0, 8)}`} spec={spec} specName={name} apiKey={apiKey} compOpacity={compOpacity} />;
                })()}
                {/* 右下角缩放把手 */}
                <div
                  onPointerDown={(e) => onResizeStart(e, name, 'br')}
                  title="右下角缩放"
                  style={{
                    position: 'absolute',
                    right: 2,
                    bottom: 2,
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'nwse-resize',
                    color: '#aaa',
                    fontSize: 12,
                    lineHeight: 1,
                    zIndex: 1,
                    borderRadius: 3,
                    transition: 'color 0.15s, background 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.transform = 'scale(1.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  ↘
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部输入栏 — 三列布局，输入框占两行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 12,
          padding: '12px 20px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: `rgba(245,245,245,${bgOpacity})`,
          borderRadius: '12px',
        }}
      >
        {/* 左侧列：工作记录 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '260px' }}>
        {/* 工作记录展示区 — 默认展示最近两条，点击展开历史 */}
        <div
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            lineHeight: 1.6,
            border: '1px solid #d0d0d0',
            borderRadius: '8px',
            backgroundColor: '#f0f0f0',
            overflow: showHistory ? 'visible' : 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            position: 'relative',
            cursor: 'pointer',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowHistory(!showHistory)}
        >
          {statusHistory.slice(-2).map((item, i) => (
            <div key={i} style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              opacity: i === 0 ? 0.6 : 1,
              fontSize: i === 0 ? 12 : 13,
            }}>
              {item}
            </div>
          ))}

          {/* 展开历史弹窗 */}
          {showHistory && statusHistory.length > 0 && (
            <div
              ref={historyRef}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: '6px',
                maxHeight: `${10 * 1.6 * 13}px`,
                overflowY: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 100,
              }}
            >
              {/* 标题栏 + 关闭按钮 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px 4px 12px',
                  borderBottom: '1px solid #eee',
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#fff',
                  zIndex: 1,
                }}
              >
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 500 }}>
                  执行历史
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowHistory(false); }}
                  style={{
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: '#999',
                    fontSize: '14px',
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              {statusHistory.slice(-30).map((item, i) => (
                <div
                  key={statusHistory.length - 30 + i}
                  style={{
                    padding: '3px 12px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: '#333',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'default',
                    backgroundColor:
                      i === Math.min(29, statusHistory.length - 1)
                        ? '#e8f5e9'
                        : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    setHoveredItem({ text: item, x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => {
                    setHoveredItem({ text: item, x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* 中间列：消息输入框（占两行高度） */}
        <div style={{ flex: 1, maxWidth: '800px', position: 'relative', display: 'flex', alignItems: 'stretch' }}>
          <textarea
            placeholder="输入消息..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 44px 10px 16px',
              fontSize: '14px',
              border: '1px solid #d0d0d0',
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: '#fff',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              position: 'absolute',
              right: '8px',
              bottom: '10px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: loading ? '#a5d6a7' : '#4CAF50',
              cursor: loading ? 'default' : 'pointer',
              padding: 0,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 5L20 12L8 19V5Z" fill="white" />
            </svg>
          </button>
        </div>

        {/* 右侧列：API Key + 背景透明度 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '260px', justifyContent: 'center' }}>
          <input
            type="password"
            placeholder="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              border: '1px solid #d0d0d0',
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: '#fff',
            }}
          />
          <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
              style={{ width: 120, accentColor: '#6366f1' }}
            />
            背景透明度
          </label>
        </div>
      </div>
      {/* 历史消息 hover tooltip */}
      {hoveredItem && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(hoveredItem.x + 10, window.innerWidth - 420),
            top: hoveredItem.y - 40,
            maxWidth: '400px',
            padding: '6px 12px',
            fontSize: '12px',
            lineHeight: 1.5,
            color: '#fff',
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderRadius: '6px',
            zIndex: 10000,
            pointerEvents: 'none',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
          }}
        >
          {hoveredItem.text}
        </div>
      )}
    </div>
  );
}

export default App;
