import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import sharp from "sharp";
import type { CatalogArtist } from "@auracle/shared";
import { artistPhotoPrompt } from "../catalog/artist-photo-prompt.js";
import { defaultManifestPath, loadCatalogManifest, resolveCatalogPath } from "../catalog/manifest.js";
import { generateImage } from "../music/minimax-image.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "../..");

loadEnv();
loadEnv({ path: resolve(apiRoot, "../../.env") });

const OUTPUT_SIZE = 1024;

function parseArgs(argv: string[]): {
  artists: CatalogArtist[];
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
    else if (arg === "--artist" && argv[i + 1]) {
      ids.add(argv[++i]!);
    } else if (arg.startsWith("--artist=")) {
      ids.add(arg.slice("--artist=".length));
    }
  }

  const manifest = loadCatalogManifest();
  if (all) return { artists: manifest.artists, skipExisting, dryRun };
  if (ids.size === 0) {
    console.error(
      "Usage: pnpm generate-artist-photos -- --artist a-id [--artist ...] | --all [--force] [--dry-run]",
    );
    process.exit(1);
  }

  const artists = manifest.artists.filter((a) => ids.has(a.id));
  const missing = [...ids].filter((id) => !artists.some((a) => a.id === id));
  if (missing.length) {
    console.error(`Unknown artist id(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  return { artists, skipExisting, dryRun };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function photoOutputPath(photoFile: string): string {
  return resolveCatalogPath(`data/artists/${photoFile}`);
}

async function main(): Promise<void> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("MINIMAX_API_KEY is not set (repo root .env)");
    process.exit(1);
  }

  const model = process.env.MINIMAX_IMAGE_MODEL ?? "image-01";
  loadCatalogManifest(defaultManifestPath());
  const { artists, skipExisting, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`Artist photos: MiniMax (${model}) · artists: ${artists.length}`);

  for (const artist of artists) {
    const outPath = photoOutputPath(artist.photoFile);
    const prompt = artistPhotoPrompt(artist);

    if (skipExisting && (await fileExists(outPath))) {
      console.log(`[skip] ${artist.id} — ${outPath} exists`);
      continue;
    }

    console.log(`[gen]  ${artist.id} "${artist.name}"`);
    console.log(`       prompt: ${prompt.slice(0, 120)}…`);

    if (dryRun) continue;

    const raw = await generateImage({ apiKey, model, prompt, aspectRatio: "1:1" });
    const buffer = await sharp(raw)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);

    const kb = Math.round(buffer.length / 1024);
    console.log(`[done] ${artist.id} → ${outPath} (${kb} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
