import { defineRegistry, useStateStore } from "@json-render/react";
import { useState, useContext, useRef, useEffect, createContext, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import { catalog } from "./catalog";

/** Context: 让组件内部知道当前渲染哪个 spec */
export const SpecNameContext = createContext<string>("");

/** Context: 组件透明度（毛玻璃效果） */
export const OpacityContext = createContext<number>(0.72);

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* ====== Design Tokens ====== */
const T = {
  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentSoft: "rgba(99,102,241,0.08)",
  accentGlow: "0 0 0 3px rgba(99,102,241,0.15)",
  surface: "rgba(255,255,255,0.72)",
  surfaceHover: "rgba(255,255,255,0.88)",
  border: "rgba(0,0,0,0.06)",
  borderFocus: "rgba(99,102,241,0.35)",
  text: "#1e1b4b",
  textDim: "#6b7280",
  textMuted: "#9ca3af",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 12px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  shadowLg: "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  radius: 12,
  radiusSm: 10,
  radiusXs: 8,
};

const glassSurface: CSSProperties = {
  background: T.surface,
  backdropFilter: "blur(12px) saturate(180%)",
  WebkitBackdropFilter: "blur(12px) saturate(180%)",
};

/** 根据 OpacityContext 返回动态毛玻璃样式 */
const useGlass = (): CSSProperties => {
  const opacity = useContext(OpacityContext);
  return {
    background: `rgba(255,255,255,${opacity})`,
    backdropFilter: "blur(12px) saturate(180%)",
    WebkitBackdropFilter: "blur(12px) saturate(180%)",
  };
};

const baseInputStyle: CSSProperties = {
  padding: "10px 14px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: T.border,
  borderRadius: T.radiusSm,
  fontSize: 14,
  fontFamily: FONT,
  color: T.text,
  outline: "none",
  background: "rgba(255,255,255,0.6)",
  transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
  width: "100%",
  boxSizing: "border-box",
};

const baseInputFocus: CSSProperties = {
  borderColor: T.borderFocus,
  boxShadow: T.accentGlow,
  background: "#fff",
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: T.text,
  fontFamily: FONT,
  letterSpacing: "0.01em",
};

export const { registry } = defineRegistry(catalog, {
  components: {
    Stack: ({ props, children }) => (
      <div
        style={{
          display: "flex",
          flexDirection: props.direction === "row" ? "row" : "column",
          flexWrap: "wrap",
          gap: props.gap ?? 16,
          minWidth: 120,
          maxWidth: "100%",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    ),

    Card: ({ props, children }) => {
      const glass = useGlass();
      return (
      <div
        style={{
          ...glass,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: T.border,
          borderRadius: T.radius,
          padding: 10,
          boxShadow: T.shadowMd,
          minWidth: 200,
          maxWidth: "100%",
          overflow: "auto",
          transition: "box-shadow 0.25s, border-color 0.25s",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = T.shadowLg;
          e.currentTarget.style.borderColor = "rgba(99,102,241,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = T.shadowMd;
          e.currentTarget.style.borderColor = T.border;
        }}
      >
        {props.title && (
          <div style={{ marginBottom: props.description ? 6 : 20 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: T.text,
                fontFamily: FONT,
                letterSpacing: "-0.01em",
              }}
            >
              {props.title}
            </div>
            {props.description && (
              <div
                style={{
                  fontSize: 13,
                  color: T.textDim,
                  marginTop: 4,
                  fontFamily: FONT,
                  fontWeight: 400,
                }}
              >
                {props.description}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
      );
    },

    Heading: ({ props }) => {
      const sizes: Record<string, { fontSize: number; color: string; weight: number }> = {
        h1: { fontSize: 24, color: T.text, weight: 700 },
        h2: { fontSize: 20, color: T.text, weight: 700 },
        h3: { fontSize: 17, color: T.text, weight: 600 },
        h4: { fontSize: 15, color: T.textDim, weight: 600 },
      };
      const s = sizes[props.level ?? "h2"] ?? sizes.h2;
      return (
        <div
          style={{
            fontSize: s.fontSize,
            fontWeight: s.weight,
            color: s.color,
            fontFamily: FONT,
            letterSpacing: "-0.01em",
          }}
        >
          {props.text}
        </div>
      );
    },

    Text: ({ props }) => (
      <div
        style={{
          fontSize: 14,
          color: T.textDim,
          lineHeight: 1.65,
          fontFamily: FONT,
        }}
      >
        {props.text}
      </div>
    ),

    Input: ({ props, bindings }) => {
      const { get, set } = useStateStore();
      const specName = useContext(SpecNameContext);
      const bindingPath = bindings?.value || "";
      const [localVal, setLocalVal] = useState(props.value ?? "");
      const storeVal = bindingPath ? (get(bindingPath) as string) : undefined;
      const value = bindingPath ? (storeVal ?? "") : (localVal ?? "");
      const [focused, setFocused] = useState(false);
      const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      const persistToFile = (v: string) => {
        if (!specName || !bindingPath) return;
        const dotPath = bindingPath.replace(/^\/+/, "").replace(/\//g, ".");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          fetch("http://localhost:3001/api/specs/set-initial-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              specName,
              path: dotPath,
              value: v,
            }),
          }).catch(() => {});
        }, 300);
      };

      useEffect(() => {
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
      }, []);

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (bindingPath) {
          set(bindingPath, v);
          persistToFile(v);
        } else {
          setLocalVal(v);
        }
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {props.label && <label style={labelStyle}>{props.label}</label>}
          <input
            type={props.type ?? "text"}
            name={props.name}
            placeholder={props.placeholder ?? ""}
            value={value}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              ...baseInputStyle,
              ...(focused ? baseInputFocus : {}),
            }}
          />
        </div>
      );
    },

    Button: ({ props, emit }) => {
      const glass = useGlass();
      const variants: Record<string, CSSProperties> = {
        primary: {
          background: `linear-gradient(135deg, ${T.accent}, ${T.accentHover})`,
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
        },
        secondary: {
          ...glass,
          color: T.text,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: T.border,
          boxShadow: T.shadowSm,
        },
        outline: {
          background: "transparent",
          color: T.accent,
          borderWidth: 1.5,
          borderStyle: "solid",
          borderColor: T.accent,
        },
      };
      const hoverEffects: Record<string, CSSProperties> = {
        primary: {
          boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          transform: "translateY(-1px)",
        },
        secondary: {
          boxShadow: T.shadowMd,
          background: T.surfaceHover,
          borderColor: "rgba(99,102,241,0.2)",
        },
        outline: {
          background: T.accentSoft,
        },
      };
      const sizes: Record<string, CSSProperties> = {
        sm: { padding: "6px 14px", fontSize: 13, borderRadius: 8 },
        md: { padding: "9px 18px", fontSize: 14, borderRadius: 10 },
        lg: { padding: "12px 24px", fontSize: 16, borderRadius: 12 },
      };
      const variant = props.variant ?? "primary";
      const size = props.size ?? "md";
      const [hover, setHover] = useState(false);
      return (
        <button
          onClick={() => emit("press")}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            ...variants[variant],
            ...sizes[size],
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
            letterSpacing: "0.01em",
            transition: "all 0.2s ease",
            ...(hover ? hoverEffects[variant] : {}),
          }}
        >
          {props.label}
        </button>
      );
    },

    Select: ({ props, bindings }) => {
      const { get, set } = useStateStore();
      const bindingPath = bindings?.value || "";
      const [localVal, setLocalVal] = useState(props.value ?? "");
      const storeVal = bindingPath ? (get(bindingPath) as string) : undefined;
      const value = bindingPath ? (storeVal ?? "") : (localVal ?? "");
      const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        if (bindingPath) set(bindingPath, v);
        else setLocalVal(v);
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {props.label && <label style={labelStyle}>{props.label}</label>}
          <select
            name={props.name}
            value={value}
            onChange={handleChange}
            style={{
              ...baseInputStyle,
              cursor: "pointer",
              appearance: "auto" as string & undefined,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 36,
            }}
          >
            {props.placeholder && <option value="">{props.placeholder}</option>}
            {props.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    },

    Switch: ({ props, bindings }) => {
      const { get, set } = useStateStore();
      const bindingPath = bindings?.checked || "";
      const [localChecked, setLocalChecked] = useState(props.checked ?? false);
      const storeChecked = bindingPath ? (get(bindingPath) as boolean) : undefined;
      const checked = bindingPath ? (storeChecked ?? false) : (localChecked ?? false);
      const handleToggle = () => {
        const next = !checked;
        if (bindingPath) set(bindingPath, next);
        else setLocalChecked(next);
      };
      const isOn = checked ?? false;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            role="switch"
            aria-checked={isOn}
            onClick={handleToggle}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "none",
              background: isOn
                ? `linear-gradient(135deg, ${T.accent}, ${T.accentHover})`
                : "#d1d5db",
              position: "relative",
              cursor: "pointer",
              transition: "all 0.25s ease",
              padding: 0,
              flexShrink: 0,
              boxShadow: isOn ? "0 0 0 3px rgba(99,102,241,0.15)" : "inset 0 1px 2px rgba(0,0,0,0.1)",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: isOn ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
          {props.label && (
            <span style={{ fontSize: 14, color: T.text, fontFamily: FONT, fontWeight: 500 }}>
              {props.label}
            </span>
          )}
        </div>
      );
    },

    Separator: () => (
      <div
        style={{
          height: 1,
          background: `linear-gradient(90deg, transparent, ${T.border}, transparent)`,
          margin: "8px 0",
        }}
      />
    ),

    List: ({ props, children }) => {
      const Tag = props.ordered ? "ol" : "ul";
      return (
        <Tag
          style={{
            paddingLeft: 24,
            margin: 0,
            fontSize: 14,
            color: T.textDim,
            fontFamily: FONT,
            lineHeight: 1.8,
          }}
        >
          {props.items
            ? props.items.map((item, i) => <li key={i}>{item}</li>)
            : children}
        </Tag>
      );
    },

    ListItem: ({ props, children }) => (
      <li
        style={{
          fontSize: 14,
          color: T.textDim,
          fontFamily: FONT,
          lineHeight: 1.6,
        }}
      >
        {children ?? props.text}
      </li>
    ),

    Image: ({ props }) => (
      <img
        src={props.src}
        alt={props.alt ?? ""}
        width={props.width}
        height={props.height}
        style={{
          borderRadius: T.radiusXs,
          objectFit: props.fit ?? "cover",
          maxWidth: "100%",
          boxShadow: T.shadowSm,
        }}
      />
    ),

    CodeBlock: ({ props }) => (
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b, #1e293b)",
          borderRadius: T.radius,
          overflow: "hidden",
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          boxShadow: T.shadowMd,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {props.language && (
          <div
            style={{
              padding: "6px 16px",
              fontSize: 11,
              fontWeight: 600,
              color: "#a5b4fc",
              background: "rgba(255,255,255,0.04)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {props.language}
          </div>
        )}
        <pre
          style={{
            margin: 0,
            padding: "16px 20px",
            fontSize: 13,
            color: "#e2e8f0",
            lineHeight: 1.7,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          <code>{props.code}</code>
        </pre>
      </div>
    ),

    Markdown: ({ props }) => (
      <div
        style={{
          fontSize: 14,
          color: T.textDim,
          fontFamily: FONT,
          lineHeight: 1.75,
        }}
      >
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "18px 0 10px", letterSpacing: "-0.01em" }}>{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: "16px 0 8px" }}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 style={{ fontSize: 16, fontWeight: 600, color: T.text, margin: "14px 0 6px" }}>{children}</h3>
            ),
            code: ({ children }) => (
              <code
                style={{
                  background: T.accentSoft,
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 13,
                  color: T.accentHover,
                  fontFamily: "'Fira Code', Consolas, monospace",
                  fontWeight: 500,
                }}
              >
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre
                style={{
                  background: "#1e1b4b",
                  color: "#e2e8f0",
                  padding: "14px 18px",
                  borderRadius: T.radiusXs,
                  fontSize: 13,
                  lineHeight: 1.7,
                  overflowX: "auto",
                }}
              >
                {children}
              </pre>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener" style={{ color: T.accent, textDecoration: "none", fontWeight: 500, borderBottom: `1px solid ${T.accent}30` }}>
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  borderLeft: `3px solid ${T.accent}`,
                  paddingLeft: 14,
                  margin: "10px 0",
                  color: T.textDim,
                  fontStyle: "italic",
                  background: T.accentSoft,
                  borderRadius: "0 6px 6px 0",
                  padding: "8px 14px",
                }}
              >
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <table style={{ borderCollapse: "collapse", width: "100%", margin: "10px 0" }}>{children}</table>
            ),
            th: ({ children }) => (
              <th style={{ borderBottom: `2px solid ${T.border}`, padding: "10px 14px", background: T.accentSoft, textAlign: "left", fontWeight: 600, color: T.text, fontSize: 13 }}>{children}</th>
            ),
            td: ({ children }) => (
              <td style={{ borderBottom: `1px solid ${T.border}`, padding: "10px 14px", color: T.textDim, fontSize: 13 }}>{children}</td>
            ),
          }}
        >
          {props.content}
        </ReactMarkdown>
      </div>
    ),

    Link: ({ props }) => (
      <a
        href={props.href}
        target={props.target ?? "_blank"}
        rel="noopener noreferrer"
        style={{
          color: T.accent,
          textDecoration: "none",
          fontSize: 14,
          fontFamily: FONT,
          fontWeight: 500,
          cursor: "pointer",
          borderBottom: `1.5px solid ${T.accent}30`,
          transition: "border-color 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${T.accent}30`; }}
      >
        {props.text}
      </a>
    ),

    Badge: ({ props }) => {
      const colors: Record<string, { bg: string; text: string; dot: string }> = {
        gray:   { bg: "#f3f4f6", text: "#374151", dot: "#9ca3af" },
        green:  { bg: "#ecfdf5", text: "#065f46", dot: "#10b981" },
        red:    { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444" },
        yellow: { bg: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
        blue:   { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6" },
        purple: { bg: "#f5f3ff", text: "#5b21b6", dot: "#8b5cf6" },
      };
      const c = colors[props.color ?? "gray"];
      const isSm = props.size === "sm";
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: isSm ? "2px 10px" : "4px 14px",
            borderRadius: 20,
            background: c.bg,
            color: c.text,
            fontSize: isSm ? 11 : 12,
            fontWeight: 600,
            fontFamily: FONT,
            lineHeight: 1.5,
            border: `1px solid ${c.dot}20`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: c.dot,
              flexShrink: 0,
            }}
          />
          {props.text}
        </span>
      );
    },

    Table: ({ props }) => (
      <div
        style={{
          overflowX: "auto",
          borderRadius: T.radiusXs,
          border: `1px solid ${T.border}`,
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: 14,
            fontFamily: FONT,
          }}
        >
          <thead>
            <tr>
              {props.columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    borderBottom: `2px solid ${T.border}`,
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: T.text,
                    background: T.accentSoft,
                    fontSize: 13,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: props.striped && i % 2 === 1 ? "rgba(0,0,0,0.02)" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentSoft; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = props.striped && i % 2 === 1 ? "rgba(0,0,0,0.02)" : "transparent"; }}
              >
                {props.columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      borderBottom: `1px solid ${T.border}`,
                      padding: "10px 16px",
                      color: T.textDim,
                    }}
                  >
                    {row[col.key] != null ? String(row[col.key]) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),

    DatePicker: ({ props, bindings }) => {
      const { get, set } = useStateStore();
      const bindingPath = bindings?.value || "";
      const [localVal, setLocalVal] = useState(props.value ?? "");
      const storeVal = bindingPath ? (get(bindingPath) as string) : undefined;
      const value = bindingPath ? (storeVal ?? "") : (localVal ?? "");
      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (bindingPath) set(bindingPath, v);
        else setLocalVal(v);
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {props.label && <label style={labelStyle}>{props.label}</label>}
          <input
            type="date"
            name={props.name}
            value={value}
            min={props.min}
            max={props.max}
            placeholder={props.placeholder}
            onChange={handleChange}
            style={baseInputStyle}
          />
        </div>
      );
    },

    /** 可拖拽的漂浮精灵（桌宠）。支持本地 PNG（自动转 file://）和远程 URL */
    FloatSprite: ({ props, bindings }) => {
      const { get, set } = useStateStore();
      const specName = useContext(SpecNameContext);
      const posBinding = bindings?.position || "";
      const storedPos = posBinding ? (get(posBinding) as { x: number; y: number } | undefined) : undefined;
      const [pos, setPos] = useState<{ x: number; y: number }>(storedPos || { x: 200, y: 200 });
      const [dragging, setDragging] = useState(false);
      const offsetRef = useRef({ x: 0, y: 0 });
      const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      // 定时提醒
      const reminderInterval = props.reminderInterval ?? 0;
      const messages: string[] = props.reminderMessages ?? [];
      const [bubble, setBubble] = useState<{ text: string; visible: boolean }>({ text: "", visible: false });
      const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const msgIdxRef = useRef(0);

      useEffect(() => {
        if (reminderInterval <= 0 || !messages.length) return;
        const id = setInterval(() => {
          const msg = messages[msgIdxRef.current % messages.length];
          msgIdxRef.current++;
          setBubble({ text: msg, visible: true });
          if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
          bubbleTimerRef.current = setTimeout(() => {
            setBubble({ text: "", visible: false });
          }, 4000);
        }, reminderInterval);
        return () => { clearInterval(id); if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current); };
      }, [reminderInterval, JSON.stringify(messages)]);

      // === 跟随鼠标 & 扔出惯性 ===
      const followMouse = props.followMouse ?? false;
      const followSpeed = props.followSpeed ?? 0.04;
      const throwEnabled = props.throwEnabled ?? false;

      console.log('[FloatSprite] props:', { followMouse, throwEnabled, followSpeed, src: (props.src||'').slice(-20) });

      // 不同步到 state 的 pos 缓存（rAF 高频更新用）
      const posRef = useRef({ x: storedPos?.x ?? 200, y: storedPos?.y ?? 200 });
      const velRef = useRef({ x: 0, y: 0 });
      const mouseRef = useRef({ x: 0, y: 0 });
      const throwingRef = useRef(false);
      const rafRef = useRef(0);
      // 拖拽期间的速度采样
      const dragSamplesRef = useRef<{ x: number; y: number; t: number }[]>([]);

      // 跟随鼠标：全局监听鼠标位置
      useEffect(() => {
        if (!followMouse) return;
        const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
      }, [followMouse]);

      // 统一 rAF 动画循环：跟随鼠标 / 扔出惯性
      const loopRef = useRef<() => void>(() => {});
      useEffect(() => {
        let running = true;
        const loop = () => {
          if (!running) return;
          const w = (props.width ?? 150);
          const h = w * 1.5;
          const maxX = window.innerWidth - 20;
          const maxY = window.innerHeight - 20;

          // 扔出惯性阶段
          if (throwingRef.current) {
            const v = velRef.current;
            const p = posRef.current;
            p.x += v.x;
            p.y += v.y;
            v.x *= 0.97;
            v.y *= 0.97;
            if (p.x < 0) { p.x = 0; v.x = Math.abs(v.x) * 0.5; }
            if (p.x > maxX - w) { p.x = maxX - w; v.x = -Math.abs(v.x) * 0.5; }
            if (p.y < 0) { p.y = 0; v.y = Math.abs(v.y) * 0.5; }
            if (p.y > maxY - h) { p.y = maxY - h; v.y = -Math.abs(v.y) * 0.5; }
            setPos({ x: Math.round(p.x), y: Math.round(p.y) });
            if (Math.abs(v.x) < 0.3 && Math.abs(v.y) < 0.3) {
              throwingRef.current = false;
              if (posBinding) { set(posBinding, { x: Math.round(p.x), y: Math.round(p.y) }); }
              persistPos({ x: Math.round(p.x), y: Math.round(p.y) });
            }
          } else if (followMouse) {
            // 跟随鼠标
            const p = posRef.current;
            const m = mouseRef.current;
            const targetX = m.x - w / 2;
            const targetY = m.y - h / 2;
            const dx = targetX - p.x;
            const dy = targetY - p.y;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
              p.x += dx * followSpeed;
              p.y += dy * followSpeed;
              p.x = Math.max(0, Math.min(maxX - w, p.x));
              p.y = Math.max(0, Math.min(maxY - h, p.y));
              setPos({ x: Math.round(p.x), y: Math.round(p.y) });
            }
          } else {
            return; // 无事可做，停
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        loopRef.current = loop;
        if (followMouse) rafRef.current = requestAnimationFrame(loop);
        return () => { running = false; cancelAnimationFrame(rafRef.current); };
      }, [followMouse, followSpeed]);

      // 路径转换：本地绝对路径 → 后端代理
      const isLocalPath = !!(props.src || "").match(/^[a-zA-Z]:\\/);
      const src = isLocalPath
        ? `http://localhost:3001/api/files?path=${encodeURIComponent(props.src as string)}`
        : props.src;

      const floatRange = props.floatRange ?? 8;
      const animName = `float_${specName || "sprite"}`;

      // 注入 @keyframes（去重）
      useEffect(() => {
        const id = `style_${animName}`;
        if (!document.getElementById(id)) {
          const style = document.createElement("style");
          style.id = id;
          style.textContent = `@keyframes ${animName} { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-${floatRange}px); } }`;
          document.head.appendChild(style);
          return () => { style.remove(); };
        }
      }, [animName, floatRange]);

      const persistPos = (p: { x: number; y: number }) => {
        if (!specName || !posBinding) return;
        const dotPath = posBinding.replace(/^\/+/, "").replace(/\//g, ".");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          fetch("http://localhost:3001/api/specs/set-initial-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specName, path: dotPath, value: p }),
          }).catch(() => {});
        }, 500);
      };

      useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);

      const handleMouseDown = (e: React.MouseEvent) => {
        const p = posRef.current;
        console.log('[FloatSprite] mousedown, throwEnabled:', throwEnabled, 'followMouse:', followMouse, 'pos:', p);
        setDragging(true);
        throwingRef.current = false;
        offsetRef.current = { x: e.clientX - p.x, y: e.clientY - p.y };
        dragSamplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        e.preventDefault();
      };

      useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
          const newX = e.clientX - offsetRef.current.x;
          const newY = e.clientY - offsetRef.current.y;
          posRef.current = { x: newX, y: newY };
          setPos({ x: newX, y: newY });
          if (posBinding) set(posBinding, { x: newX, y: newY });
          // 记录速度采样（保留最近 5 帧）
          const samples = dragSamplesRef.current;
          samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (samples.length > 5) samples.shift();
        };
        const onUp = () => {
          setDragging(false);
          console.log('[FloatSprite] mouseup, throwEnabled:', throwEnabled, 'samples:', dragSamplesRef.current.length);
          if (throwEnabled) {
            const samples = dragSamplesRef.current;
            console.log('[FloatSprite] trying throw, samples:', samples.length);
            if (samples.length >= 2) {
              const first = samples[0];
              const last = samples[samples.length - 1];
              const dt = (last.t - first.t) / 1000;
              console.log('[FloatSprite] dt:', dt.toFixed(3), 'dx:', (last.x-first.x).toFixed(1), 'dy:', (last.y-first.y).toFixed(1));
              if (dt > 0.01) {
                velRef.current = {
                  x: ((last.x - first.x) / dt) * 0.35,
                  y: ((last.y - first.y) / dt) * 0.35,
                };
                // 限制最大速度
                const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2);
                if (speed > 800) {
                  velRef.current.x = (velRef.current.x / speed) * 800;
                  velRef.current.y = (velRef.current.y / speed) * 800;
                }
                throwingRef.current = true;
                console.log('[FloatSprite] 扔出! vel:', velRef.current);
                cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(loopRef.current);
              }
            }
          }
          persistPos(posRef.current);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
      }, [dragging, throwEnabled]);

      const w = props.width ?? 150;
      return (
        <div
          data-float-sprite=""
          style={{
            position: "absolute",
            left: pos.x,
            top: pos.y,
            width: w,
            cursor: dragging ? "grabbing" : followMouse ? "default" : "grab",
            userSelect: "none",
            animation: `${animName} 3s ease-in-out infinite`,
            zIndex: 100,
            pointerEvents: "auto",
          }}
          onMouseDown={handleMouseDown}
        >
          {/* 提醒气泡 */}
          {bubble.visible && (
            <div style={{ position: "absolute", bottom: "105%", left: "50%", pointerEvents: "none" }}>
              <div
                style={{
                  position: "relative",
                  left: "-50%",
                  background: "linear-gradient(135deg, #667eea, #764ba2)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 16px rgba(102,126,234,0.35)",
                  animation: "bubbleIn 0.35s ease-out",
                }}
              >
                {bubble.text}
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: "8px solid #764ba2",
                  }}
                />
              </div>
            </div>
          )}
          <img
            src={src}
            alt={props.alt ?? "sprite"}
            draggable={false}
            style={{
              width: "100%",
              height: "auto",
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))",
              pointerEvents: "none",
            }}
          />
        </div>
      );
    },
  },
  actions: {
    submit: async (params) => {
      console.log("Form submitted:", params);
      alert("Settings saved!");
    },
    reset: async (_params, setState) => {
      setState((prev) => ({
        ...prev,
        form: {
          apiKey: "",
          model: "gpt-4o",
          temperature: "0.7",
          stream: true,
        },
      }));
    },
  },
});
