import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { memo, useRef } from "react";
import { registry, SpecNameContext, OpacityContext } from "../lib/json-render/registry";

interface ToolPanelProps {
  spec: Spec & {
    actions?: Record<string, { type: string; url?: string; endpoint?: string; method?: string }>;
    initialState?: Record<string, any>;
  };
  specName?: string;
  apiKey?: string;
  compOpacity?: number;
}

/**
 * 根据 spec.actions 配置，生成对应的 handler 函数
 * apiKeyRef 用 ref 避免闭包过期（ActionProvider 内部 useState 缓存了 handler）
 */
function buildHandlers(spec: ToolPanelProps["spec"], specName?: string, apiKeyRef?: { current: string | undefined }) {
  const getApiKey = () => apiKeyRef?.current || undefined;
  const actions = spec.actions || {};

  // submit handler
  let submitHandler = async (params: any) => {
    console.log("Submit:", params);
    alert("提交成功！");
  };

  const submitAction = actions.submit;
  if (submitAction) {
    if (submitAction.type === "url" && submitAction.url) {
      submitHandler = async (params: any) => {
        // 替换 URL 中的 {fieldName} 占位符
        let url = submitAction.url!;
        const data = params?.form || params || {};
        for (const [key, value] of Object.entries(data)) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value ?? "")));
        }
        window.open(url, "_blank");
      };
    } else if (submitAction.type === "fetch" && submitAction.endpoint) {
      submitHandler = async (params: any) => {
        try {
          const res = await fetch(submitAction.endpoint!, {
            method: submitAction.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          });
          const data = await res.json();
          console.log("Fetch result:", data);
          alert("请求完成！");
        } catch (err: any) {
          console.error("Fetch error:", err);
          alert("请求失败: " + err.message);
        }
      };
    } else if (submitAction.type === "agent") {
      // agent 类型：发送数据给后端 Agent，Agent 搜索后自动更新 spec
      // ⭐ formData 不再从前端传——后端直接读 spec 文件的 initialState
      submitHandler = async (_params: any) => {
        try {
          console.log(`[Agent Action] ${specName} → agent processing...`);
          const res = await fetch("http://localhost:3001/api/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              specName: specName || "unknown",
              actionName: "submit",
              apiKey: getApiKey(),
            }),
          });
          const data = await res.json();
          console.log("Agent action result:", data);
          if (data.ok) {
            // SSE 会自动推送 spec 更新，前端会重新渲染
            console.log(`[Agent Action] ${specName} 处理完成:`, data.message);
          } else {
            alert(`操作失败: ${data.error || "未知错误"}`);
          }
        } catch (err: any) {
          console.error("Agent action error:", err);
          alert(`请求异常: ${err.message || "网络错误"}`);
        }
      };
    }
  }

  // reset handler
  let resetHandler = async (_params: any) => {
    console.log("Reset triggered");
  };

  const resetAction = actions.reset;
  if (resetAction) {
    if (resetAction.type === "url" && resetAction.url) {
      resetHandler = async (params: any) => {
        let url = resetAction.url!;
        const data = params?.form || params || {};
        for (const [key, value] of Object.entries(data)) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value ?? "")));
        }
        window.open(url, "_blank");
      };
    }
  }

  return { submit: submitHandler, reset: resetHandler };
}

export const ToolPanel = memo(
  function ToolPanel({ spec, specName, apiKey, compOpacity = 0.72 }: ToolPanelProps) {
  if (!spec || !spec.root || !spec.elements) {
    return (
      <div
        style={{
          padding: 24,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9ca3af",
          fontSize: 14,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        No valid spec to render
      </div>
    );
  }

  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const initialState = spec.initialState || {};
  const handlers = buildHandlers(spec, specName, apiKeyRef);

  return (
    <div
      style={{
        padding: 10,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <SpecNameContext.Provider value={specName || ""}>
      <OpacityContext.Provider value={compOpacity}>
      <JSONUIProvider
        registry={registry}
        initialState={initialState}
        handlers={handlers}
      >
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
      </OpacityContext.Provider>
      </SpecNameContext.Provider>
    </div>
  );
  },
  (prev, next) => JSON.stringify(prev.spec) === JSON.stringify(next.spec) && prev.apiKey === next.apiKey && prev.compOpacity === next.compOpacity
);
