import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestUsage: vi.fn(), appendRequestLog: vi.fn(), saveRequestDetail: vi.fn(),
}));

import { buildRequestDetail, capClientBody } from "../../open-sse/handlers/chatCore/requestDetail.js";
import { getReasoningTokens, shortSessionId } from "../../src/app/(dashboard)/dashboard/usage/components/requestDetailsHelpers.js";

describe("sessionId whitelist", () => {
  it("passes sessionId through detailExtra, still drops unknown keys", () => {
    const d = buildRequestDetail({ provider: "p", model: "m", detailExtra: { sessionId: "abcd1234abcd1234", apiKey: "sk-secret" } });
    expect(d.sessionId).toBe("abcd1234abcd1234");
    expect(d.apiKey).toBeUndefined();
  });
  it("omits sessionId when missing", () => {
    expect("sessionId" in buildRequestDetail({ detailExtra: { correlationId: "c" } })).toBe(false);
  });
  it("shortSessionId", () => {
    expect(shortSessionId("abcdef0123456789")).toBe("abcdef01");
    expect(shortSessionId(null)).toBe("");
  });
});

describe("getReasoningTokens", () => {
  it("handles variants", () => {
    expect(getReasoningTokens({ reasoning_tokens: 5 })).toBe(5);
    expect(getReasoningTokens({ completion_tokens_details: { reasoning_tokens: 7 } })).toBe(7);
    expect(getReasoningTokens({ output_tokens_details: { reasoning_tokens: 9 } })).toBe(9);
    expect(getReasoningTokens({ thoughtsTokenCount: 3 })).toBe(3);
  });
  it("returns 0 when absent/invalid", () => {
    expect(getReasoningTokens(null)).toBe(0);
    expect(getReasoningTokens({})).toBe(0);
    expect(getReasoningTokens({ reasoning_tokens: 0 })).toBe(0);
    expect(getReasoningTokens({ reasoning_tokens: "x" })).toBe(0);
  });
});

describe("capClientBody", () => {
  it("keeps small bodies", () => {
    const b = { a: 1 };
    expect(capClientBody(b)).toBe(b);
  });
  it("replaces large bodies with marker", () => {
    const b = { s: "x".repeat(300) };
    const out = capClientBody(b, 100);
    expect(out._omitted).toBe(true);
    expect(out._size).toBe(JSON.stringify(b).length);
  });
  it("fail-open on null / circular", () => {
    expect(capClientBody(null)).toBeNull();
    const c = {}; c.c = c;
    expect(capClientBody(c)).toBeNull();
  });
});
