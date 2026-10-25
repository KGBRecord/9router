import { describe, it, expect, vi, beforeEach } from "vitest";

const { saveRequestDetail } = vi.hoisted(() => ({ saveRequestDetail: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/usageDb.js", () => ({
  saveRequestDetail,
  saveRequestUsage: vi.fn(),
  appendRequestLog: vi.fn(() => Promise.resolve()),
  trackPendingRequest: vi.fn(),
}));

import { createStreamController, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";
import { handleStreamingResponse, buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";

const enc = new TextEncoder();
const delta = (d) => enc.encode(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: d, finish_reason: null }] })}\n\n`);
const textChunk = delta({ content: "hello " });
const toolChunk = delta({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"a\":1}" } }] });

const upstream = (start) => new Response(new ReadableStream({ start }), { headers: { "content-type": "text/event-stream" } });
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const errorSaves = () => saveRequestDetail.mock.calls.map((c) => c[0]).filter((d) => d.status === "error");

async function setup(start) {
  const streamController = createStreamController({ log: { errorLine() {}, line() {} }, provider: "openai", model: "m" });
  const built = buildOnStreamComplete({
    provider: "openai", model: "m", connectionId: "c", requestStartTime: Date.now(),
    body: { messages: [] }, stream: true, detailExtra: {},
  });
  const completeSpy = vi.fn(built.onStreamComplete);
  completeSpy.onAbnormalEnd = built.onStreamComplete.onAbnormalEnd;
  const { response } = await handleStreamingResponse({
    providerResponse: upstream(start), provider: "openai", model: "m",
    sourceFormat: "openai", targetFormat: "openai", body: { messages: [] }, stream: true,
    requestStartTime: Date.now(), connectionId: "c", streamController,
    onStreamComplete: completeSpy, streamDetailId: built.streamDetailId,
  });
  return { response, streamController, completeSpy, id: built.streamDetailId };
}

describe("abnormal stream end detail", () => {
  beforeEach(() => saveRequestDetail.mockClear());

  it("client cancel -> 499 with partial content/toolCalls, once", async () => {
    const { response, id } = await setup((c) => { c.enqueue(textChunk); c.enqueue(toolChunk); });
    const reader = response.body.getReader();
    await reader.read(); await reader.read(); await tick(20);
    await reader.cancel();
    await tick(20);
    const errs = errorSaves();
    expect(errs).toHaveLength(1);
    expect(errs[0].id).toBe(id);
    expect(errs[0].statusCode).toBe(499);
    expect(errs[0].error).toBe("client disconnected");
    expect(errs[0].response.content).toContain("hello");
    expect(errs[0].response.toolCalls.length).toBeGreaterThan(0);
  });

  it("upstream error mid-stream -> 502 once", async () => {
    const { response, id } = await setup((c) => {
      c.enqueue(textChunk); c.enqueue(toolChunk);
      setTimeout(() => c.error(new Error("boom upstream")), 20);
    });
    const reader = response.body.getReader();
    try { for (;;) { const { done } = await reader.read(); if (done) break; } } catch { /* ok */ }
    await tick(20);
    const errs = errorSaves();
    expect(errs).toHaveLength(1);
    expect(errs[0].id).toBe(id);
    expect(errs[0].statusCode).toBe(502);
    expect(errs[0].error).toBe("boom upstream");
    expect(errs[0].response.content).toContain("hello");
    expect(errs[0].response.toolCalls.length).toBeGreaterThan(0);
  });

  it("stall via pipeWithDisconnect watchdog -> 504 once", async () => {
    const sc = createStreamController({ log: { errorLine() {}, line() {} }, provider: "p", model: "m" });
    const ts = createPassthroughStreamWithLogger("openai", null, "m", "c", { messages: [] }, null, null, null);
    const cb = vi.fn();
    sc.onAbnormalEnd = (i) => cb({ ...i, partial: ts.getPartial().content });
    const out = pipeWithDisconnect(upstream((c) => { c.enqueue(textChunk); c.enqueue(toolChunk); }), ts, sc, null, 30);
    const reader = out.getReader();
    await reader.read(); await reader.read();
    await tick(150);
    expect(cb).toHaveBeenCalledTimes(1);
    const a = cb.mock.calls[0][0];
    expect(a.statusCode).toBe(504);
    expect(a.reason).toBe("stream stall timeout");
    expect(a.partial.content).toContain("hello");
    expect(a.partial.toolCalls.length).toBeGreaterThan(0);
  });

  it("normal completion -> no abnormal row, onStreamComplete once", async () => {
    const { response, completeSpy } = await setup((c) => {
      c.enqueue(textChunk); c.enqueue(toolChunk);
      c.enqueue(enc.encode("data: [DONE]\n\n")); c.close();
    });
    const reader = response.body.getReader();
    for (;;) { const { done } = await reader.read(); if (done) break; }
    await tick(30);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(errorSaves()).toHaveLength(0);
  });
});
