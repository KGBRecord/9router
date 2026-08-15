import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = new URL("../../scripts/generate-category-rank-context-combos.mjs", import.meta.url).pathname;

describe("category/rank/context combo generator", () => {
  it("uses Codex service caps instead of OpenRouter's 1.05M GPT-5.6 catalog limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "9router-combos-"));
    const livePath = join(dir, "models.json");
    const openRouterPath = join(dir, "openrouter.txt");
    const outputPath = join(dir, "mapping.json");

    writeFileSync(livePath, JSON.stringify({
      data: [
        { id: "cx/gpt-5.6-sol", capabilities: { contextWindow: 400000, reasoning: true } },
        { id: "cx/gpt-5.6-terra", capabilities: { contextWindow: 400000, reasoning: true } },
        { id: "cx/gpt-5.5", capabilities: { contextWindow: 400000, reasoning: true } },
        { id: "kr/auto-thinking", capabilities: { contextWindow: 200000, reasoning: true } },
        { id: "kr/claude-sonnet-4.5-thinking", capabilities: { contextWindow: 200000, reasoning: true } },
        { id: "cu/glm-5.2-high", capabilities: { contextWindow: 200000, reasoning: true } },
        { id: "cu/gpt-5.6-sol-medium", capabilities: { contextWindow: 400000, reasoning: true } },
      ],
    }));
    writeFileSync(openRouterPath, [
      "openai/gpt-5.6-sol 1050000",
      "openai/gpt-5.6-terra 1050000",
      "openai/gpt-5.5 1050000",
      "openrouter/auto 2000000",
      "anthropic/claude-sonnet-4.5 1000000",
      "z-ai/glm-5.2 1048576",
    ].join("\n"));

    execFileSync(process.execPath, [generator, livePath, outputPath, openRouterPath]);
    const mapping = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(mapping.modelContexts["cx/gpt-5.6-sol"].contextLength).toBe(372000);
    expect(mapping.modelContexts["cx/gpt-5.6-terra"].contextLength).toBe(272000);
    expect(mapping.modelContexts["cx/gpt-5.5"].contextLength).toBe(400000);
    expect(mapping.modelContexts["kr/claude-sonnet-4.5-thinking"].contextLength).toBe(1000000);
    expect(mapping.modelContexts["kr/auto-thinking"]).toBeUndefined();
    expect(mapping.modelContexts["cu/glm-5.2-high"].contextLength).toBe(1048576);
    expect(mapping.modelContexts["cu/gpt-5.6-sol-medium"].contextLength).toBe(400000);
    expect(mapping.combos.map((combo) => combo.name)).toEqual(expect.arrayContaining([
      "coding-high-256k",
      "coding-mid-256k",
    ]));
    const oneMillionModels = mapping.combos
      .filter((combo) => combo.name.endsWith("-1m"))
      .flatMap((combo) => combo.models);
    expect(oneMillionModels).not.toContain("cx/gpt-5.5");
    expect(oneMillionModels).toContain("kr/claude-sonnet-4.5-thinking");
    expect(oneMillionModels).not.toContain("cx/gpt-5.6-sol");
    expect(oneMillionModels).not.toContain("cx/gpt-5.6-terra");
  });
});
