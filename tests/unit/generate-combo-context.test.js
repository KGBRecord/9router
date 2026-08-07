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
      ],
    }));
    writeFileSync(openRouterPath, [
      "openai/gpt-5.6-sol 1050000",
      "openai/gpt-5.6-terra 1050000",
    ].join("\n"));

    execFileSync(process.execPath, [generator, livePath, outputPath, openRouterPath]);
    const mapping = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(mapping.modelContexts["cx/gpt-5.6-sol"].contextLength).toBe(372000);
    expect(mapping.modelContexts["cx/gpt-5.6-terra"].contextLength).toBe(272000);
    expect(mapping.combos.map((combo) => combo.name)).toEqual(expect.arrayContaining([
      "coding-high-256k",
      "coding-mid-256k",
    ]));
    expect(mapping.combos.some((combo) => combo.name.endsWith("-1m"))).toBe(false);
  });
});
