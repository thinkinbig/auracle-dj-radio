import "./load-env.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CatalogAlbum, CatalogArtist, CatalogManifest, CatalogTrack } from "@auracle/shared";
import { normalizeCatalogCliArgs } from "./cli-args.js";
import {
  decideRegenerate,
  loadGenerationState,
  saveGenerationState,
  trackGenerationFingerprint,
} from "./generation-state.js";
import { DEFAULT_MUSIC_MODEL, generateMinimaxMusic } from "./minimax-client.js";
import { buildMinimaxMusicPrompt } from "./minimax-prompt.js";
import { loadCatalogManifest, resolveCatalogPath } from "./manifest.js";

function usage(): string {
  return [
    "usage: pnpm --filter @auracle/catalog generate-tracks [options]",
    "",
    "  Generate catalog MP3s via MiniMax Music (requires MINIMAX_API_KEY).",
    "",
    "  --track <id>     Generate one track (e.g. t31)",
    "  --all            Generate tracks missing MP3 or whose manifest inputs changed",
    "  --force          Regenerate even when MP3 exists and manifest is unchanged",
    "  --dry-run        Print prompt only; no API call",
    "  --model <id>     Override model (default: music-2.6; try music-2.6-free)",
  ].join("\n");
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function resolveTrack(
  track: CatalogTrack,
  artists: Map<string, CatalogManifest["artists"][number]>,
  albums: Map<string, CatalogManifest["albums"][number]>,
): { artist: CatalogArtist; album: CatalogAlbum; fingerprint: string; outPath: string } {
  const album = albums.get(track.albumId);
  if (!album) throw new Error(`Track ${track.id}: unknown album ${track.albumId}`);
  const artist = artists.get(album.artistId);
  if (!artist) throw new Error(`Album ${album.id}: unknown artist ${album.artistId}`);
  return {
    artist,
    album,
    fingerprint: trackGenerationFingerprint(track, artist, album),
    outPath: resolveCatalogPath(track.filePath),
  };
}

async function main(): Promise<void> {
  const args = normalizeCatalogCliArgs(process.argv.slice(2));
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const dryRun = args.includes("--dry-run");
  const manifest = loadCatalogManifest();
  const artists = new Map(manifest.artists.map((a) => [a.id, a]));
  const albums = new Map(manifest.albums.map((a) => [a.id, a]));

  const trackId = optionValue(args, "--track");
  const model = optionValue(args, "--model") ?? DEFAULT_MUSIC_MODEL;
  const force = args.includes("--force");

  let selected = manifest.tracks;
  if (trackId) {
    selected = manifest.tracks.filter((t) => t.id === trackId);
    if (selected.length === 0) throw new Error(`unknown track: ${trackId}`);
  } else if (!args.includes("--all")) {
    throw new Error("specify --track <id> or --all (two dashes)\n" + usage());
  }

  const state = loadGenerationState();
  let stateDirty = false;
  let skipped = 0;
  const pending: CatalogTrack[] = [];

  for (const track of selected) {
    const { fingerprint, outPath } = resolveTrack(track, artists, albums);
    const decision = decideRegenerate({
      fingerprint,
      assetPath: outPath,
      storedFingerprint: state.tracks[track.id]?.fingerprint,
      force,
    });

    if (decision === "skip") {
      const stored = state.tracks[track.id]?.fingerprint;
      if (existsSync(outPath) && !stored) {
        state.tracks[track.id] = { fingerprint };
        stateDirty = true;
        console.log(`  ⊘ ${track.id}: existing MP3 — recorded fingerprint (unchanged)`);
      } else {
        skipped += 1;
        console.log(`  ⊘ ${track.id}: skipped (manifest unchanged; use --force to regenerate)`);
      }
      continue;
    }

    pending.push(track);
  }

  if (!dryRun && stateDirty) saveGenerationState(state);

  if (pending.length === 0) {
    if (skipped > 0) console.log("No tracks to generate.");
    return;
  }

  if (dryRun) {
    for (const track of pending) {
      const { artist, album } = resolveTrack(track, artists, albums);
      const spec = buildMinimaxMusicPrompt({
        track,
        artist,
        album,
        sonicBrief: [album.sonicBrief, track.sonicBrief].filter(Boolean).join(" ") || undefined,
      });
      console.log(
        `\n── ${track.id} ${track.title} (${model}) ──\n` +
          `prompt: ${spec.prompt}\n` +
          `instrumental: ${spec.isInstrumental}\n` +
          (spec.lyrics ? `lyrics:\n${spec.lyrics}\n` : "") +
          (spec.lyricsOptimizer ? "lyrics_optimizer: true\n" : ""),
      );
    }
    return;
  }

  for (const track of pending) {
    const { artist, album, fingerprint, outPath } = resolveTrack(track, artists, albums);
    const spec = buildMinimaxMusicPrompt({
      track,
      artist,
      album,
      sonicBrief: [album.sonicBrief, track.sonicBrief].filter(Boolean).join(" ") || undefined,
    });

    console.log(`Generating ${track.id} (${track.title}) with ${model}…`);
    const audio = await generateMinimaxMusic({
      model,
      prompt: spec.prompt,
      isInstrumental: spec.isInstrumental,
      lyrics: spec.lyrics,
      lyricsOptimizer: spec.lyricsOptimizer,
    });

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, audio);
    state.tracks[track.id] = { fingerprint };
    stateDirty = true;
    console.log(`  → ${outPath} (${audio.length} bytes)`);
  }

  if (stateDirty) saveGenerationState(state);

  console.log("\nNext: pnpm --filter @auracle/catalog catalog-ingest");
  console.log("      pnpm --filter @auracle/catalog export-catalog");
  console.log("      pnpm --filter @auracle/music-engine seed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
