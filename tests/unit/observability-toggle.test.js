import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

describe("observability switch is authoritative over env", () => {
  let repo, settingsRepo, getAdapter;
  const wait = () => new Promise((r) => setTimeout(r, 250));
  const ids = () => repo.getRequestDetails({ page: 1, pageSize: 100 }).then((r) => r.details);

  beforeAll(async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "obs-toggle-"));
    repo = await import("@/lib/db/repos/requestDetailsRepo.js");
    settingsRepo = await import("@/lib/db/repos/settingsRepo.js");
    ({ getAdapter } = await import("@/lib/db/driver.js"));
    await settingsRepo.updateSettings({ observabilityBatchSize: 1 });
  });

  beforeEach(() => {
    repo.__resetObservabilityConfigCache();
  });

  it("env false + UI true => persists", async () => {
    process.env.ENABLE_REQUEST_LOGS = "false";
    await settingsRepo.updateSettings({ enableObservability: true });
    await repo.saveRequestDetail({ id: "a1", provider: "p", model: "m", request: {}, response: {} });
    await wait();
    expect((await ids()).some((d) => d.id === "a1")).toBe(true);
  });

  it("env true + UI false => does not persist", async () => {
    process.env.ENABLE_REQUEST_LOGS = "true";
    await settingsRepo.updateSettings({ enableObservability: false });
    await repo.saveRequestDetail({ id: "b1", provider: "p", model: "m", request: {}, response: {} });
    await wait();
    expect((await ids()).some((d) => d.id === "b1")).toBe(false);
  });

  it("raw row without key + env true => persists", async () => {
    const db = await getAdapter();
    const row = db.get("SELECT data FROM settings WHERE id = 1");
    const data = JSON.parse(row.data);
    delete data.enableObservability;
    db.run("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify(data)]);
    process.env.ENABLE_REQUEST_LOGS = "true";
    await repo.saveRequestDetail({ id: "c1", provider: "p", model: "m", request: {}, response: {} });
    await wait();
    expect((await ids()).some((d) => d.id === "c1")).toBe(true);
  });

  it("maxJsonSize from settings truncates payloads", async () => {
    await settingsRepo.updateSettings({ enableObservability: true, observabilityMaxJsonSize: 1 });
    await repo.saveRequestDetail({ id: "d1", provider: "p", model: "m", request: { big: "x".repeat(3000) }, response: {} });
    await wait();
    const d = (await ids()).find((x) => x.id === "d1");
    expect(d).toBeTruthy();
    expect(d.request._truncated).toBe(true);
  });
});
