import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Regression: flushToDatabase used a fixed field list and silently dropped the
// observability metadata (statusCode, correlationId, apiKeyName, ...).
describe("requestDetailsRepo persists observability metadata", () => {
  let repo;
  beforeAll(async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rd-meta-"));
    process.env.ENABLE_REQUEST_LOGS = "true";
    repo = await import("@/lib/db/repos/requestDetailsRepo.js");
    // settings (default batch 20) win over env: force an immediate flush
    const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
    await updateSettings({ observabilityBatchSize: 1, observabilityMaxJsonSize: 64 });
  });

  it("round-trips metadata fields and ignores unknown/secret keys", async () => {
    await repo.saveRequestDetail({
      id: "t1", provider: "claude", model: "m", status: "error", statusCode: 502,
      error: "x".repeat(900), correlationId: "c-1", attemptNumber: 2,
      requestedModel: "combo/x", apiKeyId: "k1", apiKeyName: "dev", comboName: "combo",
      endpoint: "/v1/messages", sessionId: "sess-abc", sourceFormat: "claude", targetFormat: "openai",
      apiKey: "sk-SECRET", request: {}, response: { toolCalls: [{ id: "a", name: "terminal", arguments: "{}" }] },
    });
    await new Promise((r) => setTimeout(r, 300));
    const { details } = await repo.getRequestDetails({ page: 1, pageSize: 10 });
    const d = details.find((x) => x.id === "t1");
    expect(d).toBeTruthy();
    expect(d.statusCode).toBe(502);
    expect(d.correlationId).toBe("c-1");
    expect(d.attemptNumber).toBe(2);
    expect(d.apiKeyName).toBe("dev");
    expect(d.endpoint).toBe("/v1/messages");
    expect(d.sessionId).toBe("sess-abc");
    expect(d.error.length).toBe(500);
    expect(d.response.toolCalls[0].name).toBe("terminal");
    expect(JSON.stringify(d)).not.toContain("sk-SECRET");
  });
});
