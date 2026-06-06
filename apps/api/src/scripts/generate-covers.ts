import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { CatalogAlbum } from "@auracle/shared";
import { overlayAlbumCover } from "../catalog/cover-overlay.js";
import { albumCoverPrompt } from "../catalog/cover-prompt.js";
import { defaultManifestPath, loadCatalogManifest, resolveCatalogPath } from "../catalog/manifest.js";
import { generateImage } from "../music/minimax-image.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "../..");

loadEnv();
loadEnv({ path: resolve(apiRoot, "../../.env") });

function parseArgs(argv: string[]): {
  albums: CatalogAlbum[];
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
    else if (arg === "--album" && argv[i + 1]) {
      ids.add(argv[++i]!);
    } else if (arg.startsWith("--album=")) {
      ids.add(arg.slice("--album=".length));
    }
  }

  const manifest = loadCatalogManifest();
  const artists = new Map(manifest.artists.map((a) => [a.id, a]));

  if (all) return { albums: manifest.albums, skipExisting, dryRun };
  if (ids.size === 0) {
    console.error(
      "Usage: pnpm generate-covers -- --album alb-id [--album ...] | --all [--force] [--dry-run]",
    );
    process.exit(1);
  }

  const albums = manifest.albums.filter((a) => ids.has(a.id));
  const missing = [...ids].filter((id) => !albums.some((a) => a.id === id));
  if (missing.length) {
    console.error(`Unknown album id(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  for (const album of albums) {
    if (!artists.has(album.artistId)) {
      console.error(`Album ${album.id}: unknown artist ${album.artistId}`);
      process.exit(1);
    }
  }

  return { albums, skipExisting, dryRun };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function coverOutputPath(coverFile: string): string {
  return resolveCatalogPath(`data/covers/${coverFile}`);
}

async function main(): Promise<void> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("MINIMAX_API_KEY is not set (repo root .env)");
    process.exit(1);
  }

  const model = process.env.MINIMAX_IMAGE_MODEL ?? "image-01";
  const manifest = loadCatalogManifest(defaultManifestPath());
  const artists = new Map(manifest.artists.map((a) => [a.id, a]));
  const { albums, skipExisting, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`Covers: MiniMax background (${model}) + sharp typography · albums: ${albums.length}`);

  for (const album of albums) {
    const artist = artists.get(album.artistId)!;
    const outPath = coverOutputPath(album.coverFile);
    const prompt = albumCoverPrompt(album, artist);

    if (skipExisting && (await fileExists(outPath))) {
      console.log(`[skip] ${album.id} — ${outPath} exists`);
      continue;
    }

    console.log(`[gen]  ${album.id} "${album.title}" by ${artist.name}`);
    console.log(`       prompt: ${prompt.slice(0, 120)}…`);

    if (dryRun) continue;

    const background = await generateImage({ apiKey, model, prompt, aspectRatio: "1:1" });
    const buffer = await overlayAlbumCover({
      background,
      albumTitle: album.title,
      artistName: artist.name,
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);

    const kb = Math.round(buffer.length / 1024);
    console.log(`[done] ${album.id} → ${outPath} (${kb} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
