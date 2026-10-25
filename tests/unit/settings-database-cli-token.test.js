import { describe, it, expect, vi, beforeEach } from "vitest";

// The DB export route must not treat the mere PRESENCE of x-9r-cli-token as proof of a local CLI.
vi.mock("@/lib/localDb", () => ({ exportDb: vi.fn(async () => ({ secret: "db" })), getSettings: vi.fn(), importDb: vi.fn() }));
vi.mock("@/lib/network/outboundProxy", () => ({ applyOutboundProxyEnv: vi.fn() }));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardPassword: vi.fn(async (p) => p === "right-password") }));
const hasValidCliToken = vi.fn();
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: (...a) => hasValidCliToken(...a) }));

const { GET } = await import("../../src/app/api/settings/database/route.js");
const req = (headers = {}) => ({ headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => ({}) });

describe("GET /api/settings/database CLI-token handling", () => {
  beforeEach(() => hasValidCliToken.mockReset());

  it("rejects a request that only carries a forged x-9r-cli-token header", async () => {
    hasValidCliToken.mockResolvedValue(false);
    const res = await GET(req({ "x-9r-cli-token": "forged" }));
    expect(res.status).toBe(401);
  });

  it("allows the real CLI token", async () => {
    hasValidCliToken.mockResolvedValue(true);
    const res = await GET(req({ "x-9r-cli-token": "real" }));
    expect(res.status).toBe(200);
  });

  it("falls back to the dashboard password when no valid CLI token", async () => {
    hasValidCliToken.mockResolvedValue(false);
    expect((await GET(req({ "x-9r-password": "right-password" }))).status).toBe(200);
    expect((await GET(req({ "x-9r-password": "wrong" }))).status).toBe(401);
  });
});
