import { describe, it, expect, beforeEach } from "vitest";

import {
  getRotatedModels,
  handleComboChat,
  resetComboRotation,
  shouldContinueComboFallback,
} from "../../open-sse/services/combo.js";

describe("combo round-robin routing", () => {
  beforeEach(() => {
    resetComboRotation();
  });

  it("keeps existing one-request round-robin behavior by default", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from({ length: 4 }, () => (
      getRotatedModels(models, "code-xhigh", "round-robin")[0]
    ));

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-b",
      "provider/model-a",
      "provider/model-b",
    ]);
  });

  it("sticks to each combo model for the configured number of requests", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from({ length: 6 }, () => (
      getRotatedModels(models, "code-xhigh", "round-robin", 2)[0]
    ));

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-a",
      "provider/model-b",
      "provider/model-b",
      "provider/model-a",
      "provider/model-a",
    ]);
  });

  it("tracks sticky rotation independently per combo", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-xhigh", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-b");
    expect(getRotatedModels(models, "code-xhigh", "round-robin", 2)[0]).toBe("provider/model-a");
  });

  it("does not rotate fallback combos", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
    expect(getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
  });
});

describe("combo fallback", () => {
  it("keeps a non-fallback error terminal by default", () => {
    expect(shouldContinueComboFallback(false, false)).toBe(false);
  });

  it("continues after a terminal model error when exhaustive fallback is enabled", () => {
    expect(shouldContinueComboFallback(false, true)).toBe(true);
  });

  it("tries every remaining model after a non-fallback HTTP error", async () => {
    const attempted = [];
    const responses = new Map([
      ["provider/model-a", new Response(JSON.stringify({ error: "invalid request" }), { status: 400 })],
      ["provider/model-b", new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })],
      ["provider/model-c", new Response(JSON.stringify({ ok: true }), { status: 200 })],
    ]);

    const result = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: [...responses.keys()],
      handleSingleModel: async (_body, model) => {
        attempted.push(model);
        return responses.get(model);
      },
      log: { info() {}, warn() {} },
      autoSwitch: false,
      exhaustiveFallback: true,
    });

    expect(result.status).toBe(200);
    expect(attempted).toEqual([
      "provider/model-a",
      "provider/model-b",
      "provider/model-c",
    ]);
  });
});
