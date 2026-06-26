import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { normalizeAudio } from "./audio-normalize.js";
import { runCatalogQc } from "./audio-qc.js";
import { loadCatalogManifest, resolveCatalogPath } from "./manifest.js";

function usage(): string {
  return "usage: pnpm --filter @auracle/catalog catalog-normalize [--track <id>] [--output <dir>] [--report <path>] [--replace]";
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  const allowed = new Set(["--track", "--output", "--report", "--replace"]);
  for (const arg of args) if (arg.startsWith("--") && !allowed.has(arg)) throw new Error(`unknown option: ${arg}\n${usage()}`);

  const manifest = loadCatalogManifest();
  const trackId = optionValue(args, "--track");
  const selected = trackId ? manifest.tracks.filter((track) => track.id === trackId) : manifest.tracks;
  if (trackId && selected.length === 0) throw new Error(`unknown track: ${trackId}`);

  const outputDir = optionValue(args, "--output") ? resolve(optionValue(args, "--output")!) : mkdtempSync(join(tmpdir(), "auracle-catalog-normalized-"));
  mkdirSync(outputDir, { recursive: true });
  const sourceById = new Map(selected.map((track) => [track.id, resolveCatalogPath(track.filePath)]));
  const normalizationErrors: Array<{ id: string; message: string }> = [];

  for (const track of selected) {
    try {
      await normalizeAudio(sourceById.get(track.id)!, resolve(outputDir, `${track.id}.mp3`));
    } catch (error) {
      normalizationErrors.push({ id: track.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const qc = await runCatalogQc(selected.map((track) => ({ id: track.id, title: track.title, filePath: resolve(outputDir, `${track.id}.mp3`) })));
  const replacementAllowed = normalizationErrors.length === 0 && qc.summary.failed === 0;
  if (qc.summary.failed > 0) {
    const failed = qc.tracks.filter((t) => t.status === "fail");
    for (const t of failed) console.error(`✗  ${t.track.id}: ${t.issues.map((i) => i.message).join("; ")}`);
  }
  if (qc.summary.warned > 0) {
    const warned = qc.tracks.filter((t) => t.status === "warn");
    for (const t of warned) console.warn(`⚠  ${t.track.id}: ${t.issues.map((i) => i.message).join("; ")}`);
  }
  let backupDir: string | undefined;
  if (args.includes("--replace")) {
    if (!replacementAllowed) throw new Error("refusing to replace originals: normalized candidates did not pass QC");
    const firstSource = sourceById.values().next().value as string;
    backupDir = resolve(dirname(firstSource), "..", ".audio-backups", timestamp());
    mkdirSync(backupDir, { recursive: true });
    for (const track of selected) copyFileSync(sourceById.get(track.id)!, resolve(backupDir, `${track.id}.mp3`));
    try {
      for (const track of selected) copyFileSync(resolve(outputDir, `${track.id}.mp3`), sourceById.get(track.id)!);
    } catch (error) {
      for (const track of selected) copyFileSync(resolve(backupDir, `${track.id}.mp3`), sourceById.get(track.id)!);
      throw error;
    }
  }

  const report = { schemaVersion: 1, outputDir, backupDir, replacementAllowed, normalizationErrors, qc };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = optionValue(args, "--report");
  if (reportPath) writeFileSync(resolve(reportPath), json);
  process.stdout.write(json);
  if (!replacementAllowed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
