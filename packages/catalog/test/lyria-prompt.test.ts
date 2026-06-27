import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";
import { buildCoverPrompt, buildArtistPhotoPrompt } from "../src/image-prompt.js";
import { buildLyriaPrompt } from "../src/lyria-prompt.js";

const artist: CatalogArtist = {
  id: "a-jay-zzz",
  name: "Jay-Zzz",
  slug: "jay-zzz",
  persona: "Chillhop for sleepers",
  punOf: "Jay-Z",
  visualHomage: "Blueprint era cobalt grid and gold framing",
  photoFile: "a.jpg",
};

const album: CatalogAlbum = {
  id: "alb-jay-zzz-rem",
  artistId: "a-jay-zzz",
  title: "Snooze Protocol",
  slug: "snooze-protocol",
  concept: "Desk fog",
  coverFile: "c.jpg",
  coverSubject: "Blueprint grid dissolving into Zzz and desk-lamp halos.",
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

test("buildLyriaPrompt uses narrative structure, timeline, and charter", () => {
  const prompt = buildLyriaPrompt({ track, artist, album });
  assert.match(prompt, /64 BPM/);
  assert.match(prompt, /instrumental only, no vocals/i);
  assert.match(prompt, /boom-bap/i);
  assert.match(prompt, /Avoid:/);
  assert.match(prompt, /Desk Fog/);
  assert.match(prompt, /\[0:00 - 0:15\]/);
  assert.match(prompt, /late-night desk focus/i);
});

test("vocal tracks use Lyrics: prefix and section tags", () => {
  const vocal = { ...track, instrumental: false, lyrics: "[Verse]\nTest line" };
  const prompt = buildLyriaPrompt({ track: vocal, artist, album });
  assert.match(prompt, /^Lyrics:\n\[Verse\]/m);
  assert.match(prompt, /Test line/);
  assert.doesNotMatch(prompt, /instrumental only, no vocals/i);
});

test("vocal tracks without lyrics get lyric theme from lore", () => {
  const vocal = { ...track, instrumental: false };
  const prompt = buildLyriaPrompt({ track: vocal, artist, album });
  assert.match(prompt, /Lyric theme: Mixed at whisper volume/);
});

test("buildCoverPrompt uses coverSubject and blocks text and likeness", () => {
  const prompt = buildCoverPrompt(artist, album);
  assert.match(prompt, /Blueprint grid dissolving/);
  assert.match(prompt, /No text, no typography/);
  assert.match(prompt, /no celebrity likeness/i);
});

test("buildArtistPhotoPrompt uses photoSubject when present", () => {
  const withSubject: CatalogArtist = {
    ...artist,
    photoSubject: "Sleepy producer in cobalt blueprint hoodie, face half-hidden.",
  };
  const prompt = buildArtistPhotoPrompt(withSubject);
  assert.match(prompt, /Sleepy producer in cobalt blueprint hoodie/);
  assert.match(prompt, /fictional musical artist/i);
});
