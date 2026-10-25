import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestUsage: vi.fn(async () => {}),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
}));

import { buildRequestDetail, extractToolCallsFromResponse, streamContentOrPlaceholder } from "open-sse/handlers/chatCore/requestDetail.js";

describe("buildRequestDetail detailExtra", () => {
  it("behaves as before without detailExtra", () => {
    const d = buildRequestDetail({ provider: "p", model: "m", request: {} });
    expect(d.status).toBe("success");
    expect(d.correlationId).toBeUndefined();
    expect(d.statusCode).toBeUndefined();
  });

  it("merges whitelisted fields only", () => {
    const d = buildRequestDetail({
      provider: "p", model: "m", request: {},
      detailExtra: {
        correlationId: "c1", attemptNumber: 2, requestedModel: "combo", apiKeyId: "k1", apiKeyName: "n",
        comboName: "combo", endpoint: "/v1/chat/completions", sourceFormat: "openai", targetFormat: "claude",
        apiKey: "sk-secret", evil: 1,
      },
    });
    expect(d).toMatchObject({ correlationId: "c1", attemptNumber: 2, requestedModel: "combo", apiKeyId: "k1", apiKeyName: "n", comboName: "combo", endpoint: "/v1/chat/completions", sourceFormat: "openai", targetFormat: "claude" });
    expect(d.apiKey).toBeUndefined();
    expect(d.evil).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain("sk-secret");
  });

  it("records statusCode and truncates error", () => {
    const d = buildRequestDetail({ provider: "p", model: "m", status: "error", statusCode: 502, error: "x".repeat(900) });
    expect(d.status).toBe("error");
    expect(d.statusCode).toBe(502);
    expect(d.error).toHaveLength(500);
  });

  it("overrides win over detailExtra", () => {
    const d = buildRequestDetail({ detailExtra: { endpoint: "/a" } }, { endpoint: "/b" });
    expect(d.endpoint).toBe("/b");
  });
});

describe("extractToolCallsFromResponse", () => {
  it("OpenAI", () => {
    expect(extractToolCallsFromResponse({ choices: [{ message: { tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{\"a\":1}" } }] } }] }))
      .toEqual([{ id: "c1", name: "f", arguments: "{\"a\":1}" }]);
  });
  it("Claude", () => {
    expect(extractToolCallsFromResponse({ content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "t1", name: "g", input: { x: 2 } }] }))
      .toEqual([{ id: "t1", name: "g", arguments: "{\"x\":2}" }]);
  });
  it("Responses", () => {
    expect(extractToolCallsFromResponse({ output: [{ type: "message" }, { type: "function_call", call_id: "r1", name: "h", arguments: "{}" }] }))
      .toEqual([{ id: "r1", name: "h", arguments: "{}" }]);
  });
  it("empty / invalid", () => {
    expect(extractToolCallsFromResponse(null)).toEqual([]);
    expect(extractToolCallsFromResponse({ choices: [{ message: { content: "x" } }] })).toEqual([]);
  });
});

describe("streamContentOrPlaceholder", () => {
  it("uses placeholder only when content and toolCalls are empty", () => {
    expect(streamContentOrPlaceholder({ content: "", toolCalls: [] })).toBe("[Empty streaming response]");
    expect(streamContentOrPlaceholder(undefined)).toBe("[Empty streaming response]");
    expect(streamContentOrPlaceholder({ content: "", toolCalls: [{ id: "1", name: "f", arguments: "{}" }] })).toBe("");
    expect(streamContentOrPlaceholder({ content: "hi" })).toBe("hi");
  });
});
