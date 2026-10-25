import { describe, expect, it } from "vitest";
import { createToolCallCollector } from "../../open-sse/utils/toolCallCollector.js";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";

const oa = (tool_calls) => ({ choices: [{ index: 0, delta: { tool_calls } }] });

describe("toolCallCollector", () => {
  it("OpenAI: multi-call fragments keyed by index", () => {
    const c = createToolCallCollector();
    c.push(oa([{ index: 0, id: "call_a", type: "function", function: { name: "read", arguments: "" } }]));
    c.push(oa([{ index: 0, function: { arguments: "{\"path\":" } }]));
    c.push(oa([{ index: 0, function: { arguments: "\"a.js\"}" } }]));
    c.push(oa([{ index: 1, id: "call_b", function: { name: "bash", arguments: "{\"cmd\":\"ls\"}" } }]));
    expect(c.getToolCalls()).toEqual([
      { id: "call_a", name: "read", arguments: "{\"path\":\"a.js\"}" },
      { id: "call_b", name: "bash", arguments: "{\"cmd\":\"ls\"}" },
    ]);
  });

  it("OpenAI: id-only continuation", () => {
    const c = createToolCallCollector();
    c.push(oa([{ id: "x1", function: { name: "f", arguments: "{\"a\"" } }]));
    c.push(oa([{ id: "x1", function: { arguments: ":1}" } }]));
    expect(c.getToolCalls()).toEqual([{ id: "x1", name: "f", arguments: "{\"a\":1}" }]);
  });

  it("OpenAI: missing index on 2nd call, distinct ids", () => {
    const c = createToolCallCollector();
    c.push(oa([{ id: "c1", function: { name: "one", arguments: "{}" } }]));
    c.push(oa([{ id: "c2", function: { name: "two", arguments: "{\"k\":1}" } }]));
    expect(c.getToolCalls().map((t) => [t.id, t.name, t.arguments])).toEqual([
      ["c1", "one", "{}"], ["c2", "two", "{\"k\":1}"],
    ]);
  });

  it("OpenAI: same index reused with new id starts a new call", () => {
    const c = createToolCallCollector();
    c.push(oa([{ index: 0, id: "c1", function: { name: "one", arguments: "{}" } }]));
    c.push(oa([{ index: 0, id: "c2", function: { name: "two", arguments: "{}" } }]));
    expect(c.getToolCalls()).toHaveLength(2);
  });

  it("Claude tool_use + input_json_delta", () => {
    const c = createToolCallCollector();
    c.push({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "Read", input: {} } });
    c.push({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"p\":" } });
    c.push({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "1}" } });
    c.push({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } });
    expect(c.getToolCalls()).toEqual([{ id: "toolu_1", name: "Read", arguments: "{\"p\":1}" }]);
  });

  it("Gemini functionCall", () => {
    const c = createToolCallCollector();
    c.push({ candidates: [{ content: { parts: [{ text: "x" }, { functionCall: { name: "g", args: { q: "z" } } }] } }] });
    expect(c.getToolCalls()).toEqual([{ id: "", name: "g", arguments: "{\"q\":\"z\"}" }]);
  });

  it("Responses API events", () => {
    const c = createToolCallCollector();
    c.push({ type: "response.output_item.added", output_index: 0, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "sh", arguments: "" } });
    c.push({ type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "{\"a\":" });
    c.push({ type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "2}" });
    c.push({ type: "response.function_call_arguments.done", item_id: "fc_1", arguments: "{\"a\":2}" });
    expect(c.getToolCalls()).toEqual([{ id: "call_1", name: "sh", arguments: "{\"a\":2}" }]);
  });

  it("caps arguments", () => {
    const c = createToolCallCollector();
    c.push(oa([{ index: 0, id: "c", function: { name: "n", arguments: "x".repeat(70000) } }]));
    const [t] = c.getToolCalls();
    expect(t.arguments.endsWith("…[truncated]")).toBe(true);
    expect(t.arguments.length).toBeLessThan(65536 + 20);
  });

  it("never throws on malformed chunks", () => {
    const c = createToolCallCollector();
    for (const bad of [null, undefined, 1, "s", [], { choices: "x" }, { choices: [null] }, { choices: [{ delta: { tool_calls: [null, 5, { function: null }] } }] },
      { candidates: [{ content: { parts: [null, { functionCall: 3 }] } }] }, { type: "content_block_delta", delta: null }]) {
      expect(() => c.push(bad)).not.toThrow();
    }
    expect(() => c.getToolCalls()).not.toThrow();
  });
});

describe("createPassthroughStreamWithLogger tool calls", () => {
  it("passes toolCalls to onStreamComplete", async () => {
    const sse = [
      oa([{ index: 0, id: "call_9", type: "function", function: { name: "read_file", arguments: "" } }]),
      oa([{ index: 0, function: { arguments: "{\"path\":" } }]),
      oa([{ index: 0, function: { arguments: "\"/a\"}" } }]),
      { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ].map((o) => `data: ${JSON.stringify({ id: "chatcmpl-1", model: "m", ...o })}\n\n`).join("") + "data: [DONE]\n\n";
    let got;
    const ts = createPassthroughStreamWithLogger("openai", null, "m", null, null, (content, usage, ttft) => { got = { content, usage, ttft }; });
    const enc = new TextEncoder();
    const src = new ReadableStream({ start(c) { c.enqueue(enc.encode(sse)); c.close(); } });
    const reader = src.pipeThrough(ts).getReader();
    while (!(await reader.read()).done);
    expect(got.content.toolCalls).toEqual([{ id: "call_9", name: "read_file", arguments: "{\"path\":\"/a\"}" }]);
    expect(got.content.content).toBe("");
  });
});
