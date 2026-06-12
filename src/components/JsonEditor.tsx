import { useEffect, useRef, useState, useCallback } from "react";
import type { Spec } from "@json-render/react";

interface JsonEditorProps {
  spec: Spec;
  onChange: (spec: Spec) => void;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function JsonEditor({ spec, onChange }: JsonEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(spec, null, 2));
  const [error, setError] = useState<string | null>(null);
  const specRef = useRef(spec);

  // 外部 spec 变更时同步（仅当外部变更不是由编辑器自身触发时）
  useEffect(() => {
    const serialized = JSON.stringify(spec, null, 2);
    const prevSerialized = JSON.stringify(specRef.current, null, 2);
    if (serialized !== prevSerialized) {
      specRef.current = spec;
      setText(serialized);
      setError(null);
    }
  }, [spec]);

  const debouncedParse = useCallback(
    debounce((value: string) => {
      try {
        const parsed = JSON.parse(value);
        specRef.current = parsed;
        setError(null);
        onChange(parsed);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 300),
    [onChange]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    debouncedParse(value);
  };

  const hasError = error !== null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1e1e2e",
        overflow: "hidden",
      }}
    >
      {/* 顶部标签栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: hasError ? "#f38ba8" : "#a6e3a1",
            transition: "background 0.2s",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#cdd6f4",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
          }}
        >
          JSON Spec
        </span>
      </div>

      {/* 编辑区 */}
      <textarea
        value={text}
        onChange={handleChange}
        spellCheck={false}
        style={{
          flex: 1,
          background: "transparent",
          color: "#cdd6f4",
          fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.65,
          padding: 16,
          border: "none",
          outline: "none",
          resize: "none",
          overflowY: "auto",
          caretColor: "#89b4fa",
          tabSize: 2,
        }}
      />

      {/* 底部错误提示 */}
      <div
        style={{
          flexShrink: 0,
          padding: hasError ? "8px 16px" : "0 16px",
          maxHeight: hasError ? 48 : 0,
          overflow: "hidden",
          transition: "max-height 0.2s, padding 0.2s",
          borderTop: hasError ? "1px solid #45475a" : "none",
          background: "#181825",
        }}
      >
        {hasError && (
          <span
            style={{
              fontSize: 12,
              color: "#f38ba8",
              fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Invalid JSON: {error}
          </span>
        )}
      </div>
    </div>
  );
}
