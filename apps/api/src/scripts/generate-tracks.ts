import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { Track } from "@auracle/shared";
import { SEED_TRACKS } from "../db/seed-data.js";
import { generateInstrumental } from "../music/minimax.js";
import { trackToPrompt } from "../music/prompt.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "../..");

loadEnv();
loadEnv({ path: resolve(apiRoot, "../../.env") });

function parseArgs(argv: string[]): {
  tracks: Track[];
  skipExisting: boolean;
  dryRun: boolean;
} {
  const ids = new Set<string>();
  let all = false;
  let skipExisting = true;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--all") all = true;
    else if (arg === "--force") skipExisting = false;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--track" && argv[i + 1]) {
      ids.add(argv[++i]!);
    } else if (arg.startsWith("--track=")) {
      ids.add(arg.slice("--track=".length));
    }
  }

  if (all) return { tracks: SEED_TRACKS, skipExisting, dryRun };
  if (ids.size === 0) {
    console.error(
      "Usage: pnpm generate-tracks -- --track t01 [--track t02 ...] | --all [--force] [--dry-run]",
    );
    process.exit(1);
  }

  const tracks = SEED_TRACKS.filter((t) => ids.has(t.id));
  const missing = [...ids].filter((id) => !tracks.some((t) => t.id === id));
  if (missing.length) {
    console.error(`Unknown track id(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  return { tracks, skipExisting, dryRun };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function trackOutputPath(track: Track): string {
  return resolve(apiRoot, track.filePath);
}

async function main(): Promise<void> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("MINIMAX_API_KEY is not set (repo root .env)");
    process.exit(1);
  }

  const model = process.env.MINIMAX_MODEL ?? "music-2.6-free";
  const { tracks, skipExisting, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`Model: ${model} · tracks: ${tracks.length}`);

  for (const track of tracks) {
    const outPath = trackOutputPath(track);
    const prompt = trackToPrompt(track);

    if (skipExisting && (await fileExists(outPath))) {
      console.log(`[skip] ${track.id} — ${outPath} exists`);
      continue;
    }

    console.log(`[gen]  ${track.id} "${track.title}"`);
    console.log(`       prompt: ${prompt}`);

    if (dryRun) continue;

    const { buffer, durationMs } = await generateInstrumental({
      apiKey,
      model,
      prompt,
    });

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);

    const kb = Math.round(buffer.length / 1024);
    const dur = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : "unknown duration";
    console.log(`[done] ${track.id} → ${outPath} (${kb} KB, ${dur})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
