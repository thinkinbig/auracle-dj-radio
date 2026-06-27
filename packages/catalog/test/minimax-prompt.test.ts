import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";
import { buildMinimaxMusicPrompt } from "../src/minimax-prompt.js";

const artist: CatalogArtist = {
  id: "a-jay-zzz",
  name: "Jay-Zzz",
  slug: "jay-zzz",
  persona: "Chillhop for sleepers",
  punOf: "Jay-Z",
  visualHomage: "Blueprint era",
  photoFile: "a.jpg",
};

const album: CatalogAlbum = {
  id: "alb-jay-zzz-rem",
  artistId: "a-jay-zzz",
  title: "Snooze Protocol",
  slug: "snooze-protocol",
  concept: "Desk fog",
  coverFile: "c.jpg",
};

const track: CatalogTrack = {
  id: "t31",
  albumId: "alb-jay-zzz-rem",
  title: "Desk Fog",
  energy: 1,
  tempo: 64,
  genre: "lo-fi",
  genreSlug: "lo-fi",
  mood: "calm",
  scene: "study",
  filePath: "data/tracks/t31.mp3",
  introOffsetMs: null,
  lore: "Mixed at whisper volume.",
};

test("buildMinimaxMusicPrompt marks instrumental tracks", () => {
  const spec = buildMinimaxMusicPrompt({ track, artist, album });
  assert.equal(spec.isInstrumental, true);
  assert.match(spec.prompt, /instrumental only/i);
  assert.match(spec.prompt, /64 BPM/);
  assert.match(spec.prompt, /boom-bap/i);
  assert.match(spec.prompt, /Song structure:/);
  assert.match(spec.prompt, /Production:/);
  assert.match(spec.prompt, /no spoken words/i);
});

test("vocal tracks pass lyrics or enable lyrics_optimizer", () => {
  const withLyrics = buildMinimaxMusicPrompt({
    track: { ...track, instrumental: false, lyrics: "[Verse]\nLine" },
    artist,
    album,
  });
  assert.equal(withLyrics.lyricsOptimizer, false);
  assert.equal(withLyrics.lyrics, "[Verse]\nLine");
  assert.match(withLyrics.prompt, /Vocal delivery:/);

  const improvise = buildMinimaxMusicPrompt({
    track: { ...track, instrumental: false },
    artist,
    album,
  });
  assert.equal(improvise.lyricsOptimizer, true);
  assert.match(improvise.prompt, /write coherent original lyrics/i);
});
