import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCatalogQc } from "./audio-qc.js";
import { loadCatalogManifest, resolveCatalogPath } from "./manifest.js";

function usage(): string {
  return "usage: pnpm --filter @auracle/catalog catalog-qc [--track <id>] [--report <path>] [--warn-only]";
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  const allowed = new Set(["--track", "--report", "--warn-only"]);
  for (const arg of args) if (arg.startsWith("--") && !allowed.has(arg)) throw new Error(`unknown option: ${arg}\n${usage()}`);

  const manifest = loadCatalogManifest();
  const trackId = optionValue(args, "--track");
  const selected = trackId ? manifest.tracks.filter((track) => track.id === trackId) : manifest.tracks;
  if (trackId && selected.length === 0) throw new Error(`unknown track: ${trackId}`);

  const report = await runCatalogQc(selected.map((track) => ({ id: track.id, title: track.title, filePath: resolveCatalogPath(track.filePath) })));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = optionValue(args, "--report");
  if (reportPath) writeFileSync(resolve(reportPath), json);
  process.stdout.write(json);
  if (report.summary.failed > 0 && !args.includes("--warn-only")) process.exitCode = 1;
  if (!args.includes("--warn-only") && report.summary.warned > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
