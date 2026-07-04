import "./load-env.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import type { CatalogAlbum, CatalogArtist } from "@auracle/shared";
import { compositeCover } from "./cover-composite.js";
import { DEFAULT_IMAGE_MODEL, generateMinimaxImage } from "./minimax-client.js";
import {
  artistPhotoGenerationFingerprint,
  coverGenerationFingerprint,
  decideRegenerate,
  loadGenerationState,
  saveGenerationState,
} from "./generation-state.js";
import { buildArtistPhotoPrompt, buildCoverPrompt } from "./image-prompt.js";
import { normalizeCatalogCliArgs } from "./cli-args.js";
import { loadCatalogManifest, resolveCatalogPath } from "./manifest.js";

type CoverJob = { kind: "cover"; album: CatalogAlbum; artist: CatalogArtist };
type ArtistJob = { kind: "artist"; artist: CatalogArtist };
type ImageJob = CoverJob | ArtistJob;

function usage(): string {
  return [
    "usage: pnpm --filter @auracle/catalog generate-covers [options]",
    "",
    "  Generate catalog covers and artist photos via MiniMax image-01 (requires MINIMAX_API_KEY).",
    "",
    "  --album <id>       Generate one album cover (e.g. alb-dua-debut)",
    "  --artist <id>      Generate one artist photo (e.g. a-dua-lift-a)",
    "  --all              All covers and artist photos missing or manifest-changed",
    "  --covers-only      With --all, album covers only",
    "  --artists-only     With --all, artist photos only",
    "  --force            Regenerate even when file exists and manifest is unchanged",
    "  --dry-run          Print prompt only; no API call",
    "  --model <id>       Override image model (default: image-01)",
  ].join("\n");
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function jobLabel(job: ImageJob): string {
  if (job.kind === "cover") return `${job.album.id} (${job.album.title})`;
  return `${job.artist.id} (${job.artist.name})`;
}

function jobFingerprint(job: ImageJob): string {
  if (job.kind === "cover") return coverGenerationFingerprint(job.artist, job.album);
  return artistPhotoGenerationFingerprint(job.artist);
}

function jobOutPath(job: ImageJob): string {
  if (job.kind === "cover") return resolveCatalogPath(`data/covers/${job.album.coverFile}`);
  return resolveCatalogPath(`data/artists/${job.artist.photoFile}`);
}

function jobPrompt(job: ImageJob): string {
  if (job.kind === "cover") return buildCoverPrompt(job.artist, job.album);
  return buildArtistPhotoPrompt(job.artist);
}

function storedFingerprint(
  job: ImageJob,
  state: ReturnType<typeof loadGenerationState>,
): string | undefined {
  if (job.kind === "cover") return state.covers[job.album.id]?.fingerprint;
  return state.artistPhotos[job.artist.id]?.fingerprint;
}

function recordFingerprint(job: ImageJob, state: ReturnType<typeof loadGenerationState>, fingerprint: string): void {
  if (job.kind === "cover") {
    state.covers[job.album.id] = { fingerprint };
  } else {
    state.artistPhotos[job.artist.id] = { fingerprint };
  }
}

async function main(): Promise<void> {
  const args = normalizeCatalogCliArgs(process.argv.slice(2));
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const model = optionValue(args, "--model") ?? DEFAULT_IMAGE_MODEL;

  const manifest = loadCatalogManifest();
  const artists = new Map(manifest.artists.map((a) => [a.id, a]));

  const albumId = optionValue(args, "--album");
  const artistId = optionValue(args, "--artist");
  const all = args.includes("--all");
  const coversOnly = args.includes("--covers-only");
  const artistsOnly = args.includes("--artists-only");

  if (coversOnly && artistsOnly) {
    throw new Error("use at most one of --covers-only or --artists-only");
  }

  const jobs: ImageJob[] = [];

  if (albumId) {
    const album = manifest.albums.find((a) => a.id === albumId);
    if (!album) throw new Error(`unknown album: ${albumId}`);
    const artist = artists.get(album.artistId);
    if (!artist) throw new Error(`album ${albumId}: unknown artist ${album.artistId}`);
    jobs.push({ kind: "cover", album, artist });
  } else if (artistId) {
    const artist = artists.get(artistId);
    if (!artist) throw new Error(`unknown artist: ${artistId}`);
    jobs.push({ kind: "artist", artist });
  } else if (all) {
    const wantCovers = !artistsOnly;
    const wantArtists = !coversOnly;
    if (wantCovers) {
      for (const album of manifest.albums) {
        const artist = artists.get(album.artistId);
        if (!artist) throw new Error(`album ${album.id}: unknown artist ${album.artistId}`);
        jobs.push({ kind: "cover", album, artist });
      }
    }
    if (wantArtists) {
      for (const artist of manifest.artists) {
        jobs.push({ kind: "artist", artist });
      }
    }
  } else {
    throw new Error("specify --album <id>, --artist <id>, or --all\n" + usage());
  }

  const state = loadGenerationState();
  let stateDirty = false;
  let skipped = 0;
  const pending: ImageJob[] = [];

  for (const job of jobs) {
    const fingerprint = jobFingerprint(job);
    const outPath = jobOutPath(job);
    const decision = decideRegenerate({
      fingerprint,
      assetPath: outPath,
      storedFingerprint: storedFingerprint(job, state),
      force,
    });

    if (decision === "skip") {
      const stored = storedFingerprint(job, state);
      if (existsSync(outPath) && !stored) {
        recordFingerprint(job, state, fingerprint);
        stateDirty = true;
        console.log(`  ⊘ ${jobLabel(job)}: existing image — recorded fingerprint (unchanged)`);
      } else {
        skipped += 1;
        console.log(`  ⊘ ${jobLabel(job)}: skipped (manifest unchanged; use --force to regenerate)`);
      }
      continue;
    }

    pending.push(job);
  }

  if (!dryRun && stateDirty) saveGenerationState(state);

  if (pending.length === 0) {
    if (skipped > 0) console.log("No images to generate.");
    return;
  }

  if (dryRun) {
    for (const job of pending) {
      console.log(`\n── ${job.kind} ${jobLabel(job)} (${model}) ──\n${jobPrompt(job)}\n`);
    }
    return;
  }

  if (!apiKey) {
    throw new Error(
      `MINIMAX_API_KEY is required to generate ${pending.length} image(s): ${pending.map(jobLabel).join(", ")}\n` +
        "Set it in the repo-root .env (see .env.example) or export MINIMAX_API_KEY in your shell.",
    );
  }

  for (const job of pending) {
    const prompt = jobPrompt(job);
    const outPath = jobOutPath(job);
    const fingerprint = jobFingerprint(job);

    console.log(`Generating ${job.kind} ${jobLabel(job)} with ${model}…`);
    const raw = await generateMinimaxImage(prompt, model);

    const output =
      job.kind === "cover"
        ? await compositeCover(raw, job.album.title, job.artist.name)
        : await normalizeArtistPhoto(raw);

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output);
    recordFingerprint(job, state, fingerprint);
    stateDirty = true;
    console.log(`  → ${outPath} (${output.length} bytes)`);
  }

  if (stateDirty) saveGenerationState(state);

  console.log("\nNext: pnpm --filter @auracle/catalog export-catalog");
}

/** Normalize artist photo to square JPEG. */
function normalizeArtistPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input).resize(1024, 1024, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
