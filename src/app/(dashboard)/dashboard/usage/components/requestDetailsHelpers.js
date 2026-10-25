// Pure helpers for the Request Details tab (no React; unit-testable).

export const PLACEHOLDER_CONTENTS = ["[Empty streaming response]", "[Streaming in progress...]"];

export function getToolCalls(detail) {
  const calls = detail?.response?.toolCalls;
  return Array.isArray(calls) ? calls.filter((c) => c && typeof c === "object") : [];
}

export function isPlaceholderContent(content) {
  return typeof content === "string" && PLACEHOLDER_CONTENTS.includes(content.trim());
}

// Returns pretty JSON when arguments parse, else the raw text.
export function formatToolArguments(args) {
  if (args == null || args === "") return "";
  if (typeof args !== "string") {
    try { return JSON.stringify(args, null, 2); } catch { return String(args); }
  }
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

export function getStatusBadge(detail) {
  const code = detail?.statusCode;
  const isError = detail?.status === "error" || (typeof code === "number" && code >= 400);
  if (isError) return { ok: false, label: code ? String(code) : "ERR" };
  return { ok: true, label: "OK" };
}

export function shortEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "string") return "";
  let p = endpoint;
  try { p = new URL(endpoint, "http://x").pathname; } catch { /* keep raw */ }
  return p.replace(/^\/(api\/)?v1/, "") || p;
}

// Map correlationId -> number of rows on the current page.
export function buildCorrelationCounts(details) {
  const counts = {};
  for (const d of details || []) {
    if (d?.correlationId) counts[d.correlationId] = (counts[d.correlationId] || 0) + 1;
  }
  return counts;
}

export function getAttemptLabel(detail, counts) {
  const n = detail?.attemptNumber;
  const shared = detail?.correlationId && (counts?.[detail.correlationId] || 0) > 1;
  if ((typeof n === "number" && n > 1) || shared) return `attempt ${typeof n === "number" ? n : 1}`;
  return "";
}

// Reasoning/thinking tokens across provider shapes (0 when absent).
export function getReasoningTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return 0;
  const v = tokens.reasoning_tokens
    ?? tokens.completion_tokens_details?.reasoning_tokens
    ?? tokens.output_tokens_details?.reasoning_tokens
    ?? tokens.thoughtsTokenCount
    ?? 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function shortSessionId(id) {
  return typeof id === "string" && id ? id.slice(0, 8) : "";
}

export function isTruncatedPayload(p) {
  return !!p && typeof p === "object" && p._truncated === true;
}

export function isRedactedPayload(p) {
  return !!p && typeof p === "object" && p.redacted === true;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function safeStringify(value, indent = 2) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

// Plain-text rendering of message content (string or block array).
export function messageContentToText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return safeStringify(content, 0);
  return content.map((b) => {
    if (typeof b === "string") return b;
    if (!b || typeof b !== "object") return "";
    switch (b.type) {
      case "text":
      case "input_text":
      case "output_text":
        return b.text || "";
      case "tool_use": return `[tool_use ${b.name || ""}]`.replace(" ]", "]");
      case "tool_result": return "[tool_result]";
      case "image":
      case "image_url": return "[image]";
      case "thinking": return "[thinking]";
      default: return b.text || `[${b.type || "block"}]`;
    }
  }).filter(Boolean).join("\n");
}

export function getToolName(t) {
  return t?.name || t?.function?.name || t?.function_declarations?.[0]?.name || t?.type || "tool";
}

export function summarizePayload(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : null;
  const tools = Array.isArray(payload?.tools) ? payload.tools : null;
  return {
    messageCount: messages ? messages.length : 0,
    toolCount: tools ? tools.length : 0,
    messages,
    tools,
  };
}
