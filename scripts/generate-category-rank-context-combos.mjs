import fs from "node:fs";

const sourcePath = process.argv[2] || "/tmp/omni-live-models.json";
const outputPath = process.argv[3] || "omni-combos.mapping.json";
const openRouterPath = process.argv[4] || "openrouter_all_models.txt";
const prefixes = new Set(["ag", "bzl", "cc", "cx", "gh", "kr", "nvidia", "ollama"]);
const prohibitedModels = new Set(["cc/claude-fable-5"]);
const bazaarlinkFreeModels = new Set(["bzl/deepseek-v4-flash", "bzl/qwen3.7-flash"]);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const items = source.data.filter((item) => prefixes.has(item.id.split("/", 1)[0]));
const openRouterContexts = new Map(
  fs.readFileSync(openRouterPath, "utf8").trim().split("\n").map((line) => {
    const separator = line.lastIndexOf(" ");
    return [line.slice(0, separator), Number(line.slice(separator + 1))];
  }),
);

function canonicalName(id) {
  let name = id.slice(id.indexOf("/") + 1);
  if (name.includes("/")) name = name.slice(name.indexOf("/") + 1);
  name = name.replace(/-(thinking-agentic|thinking|agentic|review)$/i, "");
  return name
    .replace("claude-haiku-4-5-20251001", "claude-haiku-4.5")
    .replace("claude-sonnet-4-6", "claude-sonnet-4.6")
    .replace("claude-opus-4-6", "claude-opus-4.6")
    .toLowerCase();
}

const openRouterByCanonicalName = new Map();
for (const [id, length] of openRouterContexts) {
  const name = id.slice(id.indexOf("/") + 1).toLowerCase();
  if (!openRouterByCanonicalName.has(name)) openRouterByCanonicalName.set(name, []);
  openRouterByCanonicalName.get(name).push({ id, contextLength: length });
}

function context(item) {
  const matches = openRouterByCanonicalName.get(canonicalName(item.id)) || [];
  if (matches.length && new Set(matches.map(({ contextLength }) => contextLength)).size === 1) {
    return { contextLength: matches[0].contextLength, source: "openrouter", canonicalId: matches[0].id };
  }
  const live = item.capabilities?.contextWindow;
  if (live) return { contextLength: Number(live), source: "runtime" };
  const id = item.id.toLowerCase();
  if (["kr/auto", "kr/auto-thinking"].includes(id)) return null;
  if (id.includes("qwen3-coder-next")) return { contextLength: 262144, source: "repo-capability-fallback" };
  if (["claude-sonnet-4", "claude-sonnet-4.5", "claude-haiku-4.5", "deepseek-3.2", "minimax-m2.5", "minimax-m2.1", "glm-5"].some((name) => id.includes(name))) return { contextLength: 200000, source: "repo-capability-fallback" };
  return null;
}

function contextTier(value) {
  if (value >= 1000000) return "1m";
  if (value >= 400000) return "400k";
  if (value >= 256000) return "256k";
  if (value >= 196608) return "200k";
  if (value >= 128000) return "128k";
  return "16k";
}

function rank(id) {
  // Codex generations and 5.6 grades form quality ranks. Review mode does not
  // change rank: Sol → high, Terra → mid, Luna → low.
  if (id.startsWith("cx/gpt-5.6-sol")) return "high";
  if (id.startsWith("cx/gpt-5.6-terra")) return "mid";
  if (id.startsWith("cx/gpt-5.6-luna")) return "low";
  if (id.startsWith("cx/gpt-5.5")) return "mid";
  if (id.startsWith("cx/gpt-5.4") || id.startsWith("cx/gpt-5.3")) return "low";

  // BazaarLink grades.
  if (id === "bzl/deepseek-v4-flash" || id === "bzl/qwen3.7-flash") return "mid";
  if (id === "bzl/auto:free") return "low";
  if (id.startsWith("bzl/gpt-5.5")) return "mid";
  if (id.startsWith("bzl/gpt-5.4")) return "low";
  if (id.includes("grok-4.20")) return "high";
  if (id.includes("grok-4.3")) return "mid";
  if (id.includes("gemini-3.1-pro")) return "mid";
  if (id.includes("gemini-3-flash") || id.includes("gemini-3.1-flash-lite")) return "low";
  if (id.includes("mimo-v2.5-pro")) return "high";
  if (id.includes("mimo-v2.5")) return "mid";
  if (id.includes("qwen3.6-plus")) return "high";

  // Explicit family/version grading. Keep this before generic product-tier rules
  // so a newer generation is not flattened together with an older one.
  if (id.includes("gemini-3.6-flash-high")) return "high";
  if (id.includes("gemini-3.6-flash-medium")) return "mid";
  if (id.includes("gemini-3.6-flash-low")) return "low";
  if (id.includes("gemini-3.5-flash-high")) return "mid";
  if (id.includes("gemini-3.5-flash-low") || id.includes("gemini-3.5-flash-extra-low")) return "low";
  if (id.includes("gemini-3-flash") || id.includes("gemini-3.1-pro-low")) return "low";

  if (id.includes("minimax-m3")) return "high";
  if (id.includes("minimax-m2.7")) return "mid";
  if (id.includes("minimax-m2.5") || id.includes("minimax-m2.1")) return "low";

  if (id.includes("glm-5.2")) return "high";
  if (id.includes("glm-5.1")) return "mid";
  if (id.includes("glm-5") || id.includes("glm-4.7")) return "low";

  if (id.includes("kimi-k3")) return "high";
  if (id.includes("kimi-k2.7")) return "mid";
  if (id.includes("kimi-k2.6") || id.includes("kimi-k2.5")) return "low";

  if (id.includes("nemotron-3-ultra")) return "high";
  if (id.includes("nemotron-3-super")) return "mid";
  if (id.includes("qwen3.5") || id.includes("mistral-large-3")) return "high";
  if (id.includes("qwen3-coder-next")) return "mid";
  if (id.includes("deepseek-v4-pro")) return "high";
  if (id.includes("deepseek-v4-flash")) return "mid";
  if (id.includes("deepseek-3.2")) return "low";

  if (id.startsWith("gh/gpt-4") && !id.startsWith("gh/gpt-4.1") && !id.startsWith("gh/gpt-4o")) return "low";
  if (["copilot-search", "exec-agent", "trajectory-compaction", "picker", "secondary", "tertiary", "4th"].some((term) => id.includes(term))) return "low";

  const high = ["opus", "gemini-pro-agent"];
  const low = ["haiku", "mini", "flash-low", "extra-low", "gpt-3.5", "gpt-4-", "gpt-4o-mini"];
  if (high.some((term) => id.includes(term))) return "high";
  if (low.some((term) => id.includes(term))) return "low";
  return "mid";
}

function categories(item) {
  const id = item.id.toLowerCase();
  // Codex review variants are dedicated review targets, not broad fallbacks.
  if (id.startsWith("cx/") && id.endsWith("-review")) return ["review"];
  if (id === "bzl/auto:free") return ["general"];
  if (id.includes("parakeet")) return ["multimodal"];
  if (["copilot-search", "exec-agent", "trajectory-compaction", "picker", "secondary", "tertiary", "4th"].some((term) => id.includes(term))) return ["general"];
  const result = new Set(["general"]);
  if (["codex", "code", "oswe", "qwen3-coder", "mai-code", "agentic", "exec-agent"].some((term) => id.includes(term))) result.add("coding");
  if (id.includes("-review")) result.add("review");
  if (item.capabilities?.reasoning || ["thinking", "opus", "sonnet", "glm", "deepseek", "qwen", "gpt-5", "gemini"].some((term) => id.includes(term))) result.add("reasoning");
  if (item.capabilities?.vision || ["image", "gemini", "kimi"].some((term) => id.includes(term))) result.add("multimodal");
  if (["claude-opus-5", "claude-sonnet-5", "gpt-5.6", "deepseek-v4", "gemini-3.6-flash"].some((term) => id.includes(term))) {
    result.add("coding");
    result.add("review");
  }
  if (id.startsWith("bzl/") && ["claude", "gpt-5", "grok", "glm", "kimi", "minimax", "mimo", "qwen"].some((term) => id.includes(term))) {
    result.add("coding");
  }
  if (id.startsWith("bzl/") && rank(id) !== "low" && ["claude", "gpt-5", "grok", "gemini", "qwen"].some((term) => id.includes(term))) {
    result.add("review");
  }
  return [...result].sort();
}

const groups = new Map();
const excluded = [];
const modelContexts = {};
for (const item of items.sort((a, b) => a.id.localeCompare(b.id))) {
  if (prohibitedModels.has(item.id)) {
    excluded.push({ id: item.id, reason: "explicitly prohibited from combos" });
    continue;
  }
  if (item.id.startsWith("bzl/") && !bazaarlinkFreeModels.has(item.id)) {
    excluded.push({ id: item.id, reason: "BazaarLink combo policy allows only the two active free models" });
    continue;
  }
  const resolved = context(item);
  if (resolved === null) {
    excluded.push({ id: item.id, reason: "dynamic router has no fixed contextLength" });
    continue;
  }
  const length = resolved.contextLength;
  modelContexts[item.id] = resolved;
  const modelRank = rank(item.id.toLowerCase());
  const tier = contextTier(length);
  for (const category of categories(item)) {
    const name = `${category}-${modelRank}-${tier}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ id: item.id, contextLength: length });
  }
}

const categoryOrder = ["coding", "review", "reasoning", "multimodal", "general"];
const rankOrder = ["high", "mid", "low"];
const tierOrder = ["1m", "400k", "256k", "200k", "128k", "16k"];
const sortKey = (name) => {
  const [category, modelRank, tier] = name.split("-");
  return [categoryOrder.indexOf(category), rankOrder.indexOf(modelRank), tierOrder.indexOf(tier)];
};
const combos = [...groups.entries()]
  .sort(([a], [b]) => sortKey(a).find((value, index) => value !== sortKey(b)[index]) - sortKey(b).find((value, index) => value !== sortKey(a)[index]))
  .map(([name, members]) => ({ name, models: members.map(({ id }) => id), kind: "llm", contextLength: Math.min(...members.map(({ contextLength }) => contextLength)) }));

fs.writeFileSync(outputPath, `${JSON.stringify({
  source: "https://omni.tdigroup.vn/v1/models",
  contextSource: "OpenRouter canonical matches first; runtime metadata second; repository capability fallback last.",
  policy: "Category × rank × context-tier taxonomy. Provider duplication is allowed. contextLength is the minimum resolved context of members.",
  excluded,
  modelContexts,
  combos,
}, null, 2)}\n`);