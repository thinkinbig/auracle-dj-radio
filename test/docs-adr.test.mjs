import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ADR-0002 is marked superseded by deterministic structured selection", () => {
  const adr = readFileSync(join(root, "docs/adr/0002-phased-catalog-embedding.md"), "utf8");
  assert.match(adr, /\*\*Status\*\*:\s*Superseded/i);
  assert.match(adr, /0001-deterministic-structured-selection/);
});

test("README dev setup has no Qdrant or catalog embedding seed steps", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.doesNotMatch(readme, /dev:infra/i);
  assert.doesNotMatch(readme, /AURACLE_EMBEDDER/i);
  assert.doesNotMatch(readme, /音频 embedding/i);
});

test("music-engine env example has no catalog embedder vars", () => {
  const env = readFileSync(join(root, "services/music-engine/.env.example"), "utf8");
  assert.doesNotMatch(env, /AURACLE_EMBEDDER/i);
  assert.doesNotMatch(env, /GEMINI_EMBED_MODEL/i);
});
