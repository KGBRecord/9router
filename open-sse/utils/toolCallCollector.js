// Collects tool calls (name + arguments) from streamed chunks of any client
// format that stream.js emits: OpenAI chat, Claude SSE, Gemini, and (best
// effort) OpenAI Responses. Fail-open: push() never throws.

const MAX_ARGS_BYTES = 64 * 1024;
const TRUNC_MARK = "…[truncated]";

export function createToolCallCollector() {
  const calls = [];            // ordered entries { id, name, args, truncated }
  const byId = new Map();
  const byOpenAIIndex = new Map();
  const byClaudeIndex = new Map();
  const byResponsesKey = new Map();
  let lastOpenAI = null;

  const newEntry = (id, name) => {
    const e = { id: id || "", name: name || "", args: "", truncated: false };
    calls.push(e);
    if (id) byId.set(id, e);
    return e;
  };

  const append = (e, frag) => {
    if (typeof frag !== "string" || !frag || e.truncated) return;
    if (e.args.length + frag.length > MAX_ARGS_BYTES) {
      e.args += frag.slice(0, Math.max(0, MAX_ARGS_BYTES - e.args.length));
      e.truncated = true;
      return;
    }
    e.args += frag;
  };

  const pushOpenAI = (toolCalls) => {
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      const id = typeof tc.id === "string" && tc.id ? tc.id : null;
      const idx = Number.isInteger(tc.index) ? tc.index : null;
      let e = null;
      if (id && byId.has(id)) e = byId.get(id);
      else if (idx !== null && byOpenAIIndex.has(idx)) {
        const cand = byOpenAIIndex.get(idx);
        // Same index but a different, already-known id means a new call.
        if (!id || !cand.id || cand.id === id) e = cand;
      } else if (!id && idx === null) e = lastOpenAI;

      if (!e) {
        // A bare fragment with no identity and no previous call has nowhere to go
        // unless it carries a name.
        if (!id && idx === null && !tc.function?.name && !lastOpenAI) {
          if (typeof tc.function?.arguments !== "string") continue;
        }
        e = newEntry(id, tc.function?.name);
      } else {
        if (id && !e.id) { e.id = id; byId.set(id, e); }
        if (tc.function?.name && !e.name) e.name = tc.function.name;
      }
      if (idx !== null) byOpenAIIndex.set(idx, e);
      lastOpenAI = e;
      append(e, tc.function?.arguments);
    }
  };

  const pushResponses = (chunk) => {
    const type = chunk.type;
    const item = chunk.item;
    if (type === "response.output_item.added" || type === "response.output_item.done") {
      if (item?.type !== "function_call") return;
      const keys = [chunk.output_index, item.id, item.call_id].filter((k) => k !== undefined && k !== null);
      let e = null;
      for (const k of keys) if (byResponsesKey.has(k)) { e = byResponsesKey.get(k); break; }
      if (!e) e = newEntry(item.call_id || item.id, item.name);
      if (!e.name && item.name) e.name = item.name;
      if (!e.id && (item.call_id || item.id)) { e.id = item.call_id || item.id; byId.set(e.id, e); }
      for (const k of keys) byResponsesKey.set(k, e);
      if (type === "response.output_item.done" && !e.args && typeof item.arguments === "string") append(e, item.arguments);
      else if (type === "response.output_item.added" && typeof item.arguments === "string") append(e, item.arguments);
    } else if (type === "response.function_call_arguments.delta") {
      const e = byResponsesKey.get(chunk.item_id) ?? byResponsesKey.get(chunk.output_index);
      if (e) append(e, chunk.delta);
    } else if (type === "response.function_call_arguments.done") {
      const e = byResponsesKey.get(chunk.item_id) ?? byResponsesKey.get(chunk.output_index);
      if (e && !e.args) append(e, chunk.arguments);
    }
  };

  const push = (chunk) => {
    try {
      if (!chunk || typeof chunk !== "object") return;

      // OpenAI chat
      const choices = chunk.choices;
      if (Array.isArray(choices)) {
        for (const choice of choices) {
          const tcs = choice?.delta?.tool_calls;
          if (Array.isArray(tcs) && tcs.length) pushOpenAI(tcs);
        }
      }

      // Claude SSE
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
        const cb = chunk.content_block;
        const e = newEntry(cb.id, cb.name);
        if (Number.isInteger(chunk.index)) byClaudeIndex.set(chunk.index, e);
        if (cb.input && typeof cb.input === "object" && Object.keys(cb.input).length) append(e, JSON.stringify(cb.input));
      } else if (chunk.type === "content_block_delta" && chunk.delta?.type === "input_json_delta") {
        const e = byClaudeIndex.get(chunk.index);
        if (e) append(e, chunk.delta.partial_json);
      }

      // Gemini
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const fc = part?.functionCall;
          if (!fc || typeof fc !== "object") continue;
          const e = newEntry(fc.id, fc.name);
          append(e, JSON.stringify(fc.args ?? {}));
        }
      }

      // OpenAI Responses (best effort)
      if (typeof chunk.type === "string" && chunk.type.startsWith("response.")) pushResponses(chunk);
    } catch {
      // fail-open: observability must never break the stream
    }
  };

  const getToolCalls = () =>
    calls.map((e) => ({ id: e.id, name: e.name, arguments: e.truncated ? e.args + TRUNC_MARK : e.args }));

  return { push, getToolCalls };
}
