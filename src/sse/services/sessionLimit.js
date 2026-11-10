/**
 * Per-account 5h session usage cap.
 * A connection may set providerSpecificData.sessionLimitPercent (1-99). Once the
 * account's 5h session window is used >= that %, auth.js skips it until the
 * window resets, leaving the rest of the session for the account owner.
 * Fail-open: any error / unknown reading keeps the account selectable.
 */

import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getClaudeUsage } from "open-sse/services/usage/claude.js";
import { getCodexUsage } from "open-sse/services/usage/codex.js";
import * as log from "../utils/logger.js";

const CACHE_TTL_MS = 60_000;
// connectionId → { fetchedAt, used, resetAt }
const readingCache = new Map();
const inflight = new Map();

// provider → how to read the 5h session % used from a usage payload
const SESSION_READERS = {
  claude: {
    fetch: (c, proxyOptions) => getClaudeUsage(c.accessToken, proxyOptions),
    pick: (quotas) => quotas?.["session (5h)"],
  },
  codex: {
    fetch: (c, proxyOptions) => getCodexUsage(c.accessToken, proxyOptions),
    pick: (quotas) => quotas?.session,
  },
};

export function getSessionLimitPercent(connection) {
  const raw = Number(connection?.providerSpecificData?.sessionLimitPercent);
  return Number.isFinite(raw) && raw > 0 && raw < 100 ? raw : null;
}

async function readSession(connection) {
  const reader = SESSION_READERS[connection.provider];
  if (!reader || !connection.accessToken) return null;

  const hit = readingCache.get(connection.id);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit;
  if (inflight.has(connection.id)) return inflight.get(connection.id);

  const p = (async () => {
    try {
      const cfg = await resolveConnectionProxyConfig(connection.providerSpecificData || {});
      const proxyOptions = {
        connectionProxyEnabled: cfg.connectionProxyEnabled === true,
        connectionProxyUrl: cfg.connectionProxyUrl || "",
        connectionNoProxy: cfg.connectionNoProxy || "",
        vercelRelayUrl: cfg.vercelRelayUrl || "",
        strictProxy: false,
      };
      const usage = await reader.fetch(connection, proxyOptions);
      const q = reader.pick(usage?.quotas);
      if (!q || typeof q.used !== "number") return hit || null;
      const entry = { fetchedAt: Date.now(), used: q.used, resetAt: q.resetAt || null };
      readingCache.set(connection.id, entry);
      return entry;
    } catch (e) {
      log.warn("SESSION_LIMIT", `${connection.id?.slice(0, 8)} | read failed: ${e.message}`);
      return hit || null;
    } finally {
      inflight.delete(connection.id);
    }
  })();
  inflight.set(connection.id, p);
  return p;
}

/**
 * @returns {Promise<Map<string, string>>} connectionId → resetAt ISO (or "" if unknown)
 *   for connections whose 5h session usage reached their configured cap.
 */
export async function getSessionLimitBlocks(connections) {
  const blocked = new Map();
  await Promise.all(connections.map(async (c) => {
    const limit = getSessionLimitPercent(c);
    if (!limit) return;
    const r = await readSession(c);
    if (!r || r.used < limit) return;
    if (r.resetAt && new Date(r.resetAt).getTime() <= Date.now()) return; // window already rolled over
    log.info("SESSION_LIMIT", `${c.id?.slice(0, 8)} | 5h used ${Math.round(r.used)}% >= cap ${limit}% — skip until ${r.resetAt || "reset"}`);
    blocked.set(c.id, r.resetAt || "");
  }));
  return blocked;
}
