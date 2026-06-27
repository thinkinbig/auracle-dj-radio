import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCatalogCliArgs } from "../src/cli-args.js";

test("normalizeCatalogCliArgs maps -all to --all", () => {
  assert.deepEqual(normalizeCatalogCliArgs(["-all"]), ["--all"]);
  assert.deepEqual(normalizeCatalogCliArgs(["--track", "t31", "-dry-run"]), [
    "--track",
    "t31",
    "--dry-run",
  ]);
});
