import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SESSION_FLOW } from "../src/session/flow.js";

const sessionDir = join(dirname(fileURLToPath(import.meta.url)), "../src/session");

function allSessionSources(): string {
  const chunks: string[] = [];
  function walk(dir: string): void {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) walk(path);
      else if (ent.name.endsWith(".ts")) chunks.push(readFileSync(path, "utf8"));
    }
  }
  walk(sessionDir);
  return chunks.join("\n");
}

describe("SESSION_FLOW catalog", () => {
  const sources = allSessionSources();

  for (const [flowName, steps] of Object.entries(SESSION_FLOW)) {
    it(`${flowName} steps exist in session modules`, () => {
      for (const step of steps) {
        expect(sources, `missing step: ${step}`).toMatch(new RegExp(`\\bfunction ${step}\\b`));
      }
    });
  }
});
