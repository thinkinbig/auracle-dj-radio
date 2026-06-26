import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { normalizeAudio } from "./audio-normalize.js";
import { runCatalogQc, type TrackQcResult } from "./audio-qc.js";
import { loadCatalogManifest, resolveCatalogPath } from "./manifest.js";

function usage(): string {
  return [
    "usage: pnpm --filter @auracle/catalog catalog-ingest [--track <id>] [--dry-run]",
    "",
    "  Normalize all tracks (or a single --track), run QC, and replace originals.",
    "  --dry-run   Normalize & QC but do NOT replace originals.",
    "  --track <id>  Ingest only one track.",
  ].join("\n");
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

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printSummary(tracks: TrackQcResult[]): void {
  const statusIcon: Record<string, string> = { pass: "✓", warn: "⚠", fail: "✗" };
  console.log("\n┌──────┬──────────────────────────────┬──────┐");
  console.log("│ " + pad("id", 5) + "│ " + pad("title", 30) + "│ " + pad("status", 5) + "│");
  console.log("├──────┼──────────────────────────────┼──────┤");
  for (const t of tracks) {
    const icon = statusIcon[t.status] ?? "?";
    const title = t.track.title.length > 28 ? t.track.title.slice(0, 27) + "…" : t.track.title;
    console.log(`│ ${pad(t.track.id, 4)} │ ${pad(title, 28)} │ ${icon} ${pad(t.status, 3)}│`);
  }
  console.log("└──────┴──────────────────────────────┴──────┘");
  const failed = tracks.filter((t) => t.status === "fail");
  const warned = tracks.filter((t) => t.status === "warn");
  if (failed.length > 0) {
    console.log(`\n✗ ${failed.length} track(s) failed QC — review above before committing:\n`);
    for (const t of failed) {
      console.log(`  ${t.track.id}: ${t.issues.map((i) => i.message).join("; ")}`);
    }
  }
  if (warned.length > 0) {
    console.log(`\n⚠ ${warned.length} track(s) with warnings (duration / silence) — replaced anyway:\n`);
    for (const t of warned) {
      console.log(`  ${t.track.id}: ${t.issues.map((i) => i.message).join("; ")}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  const allowed = new Set(["--track", "--dry-run"]);
  for (const arg of args) if (arg.startsWith("--") && !allowed.has(arg)) throw new Error(`unknown option: ${arg}\n${usage()}`);

  const manifest = loadCatalogManifest();
  const trackId = optionValue(args, "--track");
  const selected = trackId ? manifest.tracks.filter((t) => t.id === trackId) : manifest.tracks;
  if (trackId && selected.length === 0) throw new Error(`unknown track: ${trackId}`);
  if (selected.length === 0) {
    console.log("No tracks to ingest.");
    return;
  }

  console.log(`Ingesting ${selected.length} track(s)…`);
  const dryRun = args.includes("--dry-run");

  // Phase 1: normalize
  const outputDir = mkdtempSync(join(tmpdir(), "auracle-ingest-"));
  mkdirSync(outputDir, { recursive: true });
  const sourceById = new Map(selected.map((t) => [t.id, resolveCatalogPath(t.filePath)]));
  const normErrors: Array<{ id: string; message: string }> = [];

  for (const track of selected) {
    try {
      await normalizeAudio(sourceById.get(track.id)!, resolve(outputDir, `${track.id}.mp3`));
    } catch (error) {
      normErrors.push({ id: track.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (normErrors.length > 0) {
    console.error(`\n✗ ${normErrors.length} track(s) failed normalization:`);
    for (const e of normErrors) console.error(`  ${e.id}: ${e.message}`);
    process.exit(2);
  }

  // Phase 2: QC
  const qc = await runCatalogQc(selected.map((t) => ({
    id: t.id,
    title: t.title,
    filePath: resolve(outputDir, `${t.id}.mp3`),
  })));
  const canReplace = qc.summary.failed === 0;

  printSummary(qc.tracks);

  if (!canReplace) {
    console.log("\nFix the failures above, then re-run.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("\n--dry-run: skipping replacement. Run without --dry-run to replace originals.");
    return;
  }

  // Phase 3: replace originals
  const firstSource = sourceById.values().next().value as string;
  const backupDir = resolve(dirname(firstSource), "..", ".audio-backups", timestamp());
  mkdirSync(backupDir, { recursive: true });
  for (const track of selected) copyFileSync(sourceById.get(track.id)!, resolve(backupDir, `${track.id}.mp3`));
  try {
    for (const track of selected) copyFileSync(resolve(outputDir, `${track.id}.mp3`), sourceById.get(track.id)!);
  } catch (error) {
    for (const track of selected) copyFileSync(resolve(backupDir, `${track.id}.mp3`), sourceById.get(track.id)!);
    throw error;
  }

  const passed = qc.summary.passed;
  const warned = qc.summary.warned;
  console.log(`\n✓ Replaced ${passed + warned} originals (backup in ${backupDir})`);

  // Next steps
  console.log("\nNext steps:");
  console.log('  git add packages/catalog/data/tracks/*.mp3');
  console.log('  git commit -m "chore(catalog): ingest & normalize tracks"');
  console.log("  git push");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
