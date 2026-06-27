import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";
import {
  artistPhotoGenerationFingerprint,
  coverGenerationFingerprint,
  decideRegenerate,
  loadGenerationState,
  trackGenerationFingerprint,
} from "../src/generation-state.js";

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

test("trackGenerationFingerprint is stable for the same manifest inputs", () => {
  const a = trackGenerationFingerprint(track, artist, album);
  const b = trackGenerationFingerprint(track, artist, album);
  assert.equal(a, b);
});

test("trackGenerationFingerprint changes when lore changes", () => {
  const before = trackGenerationFingerprint(track, artist, album);
  const after = trackGenerationFingerprint({ ...track, lore: "Different lore." }, artist, album);
  assert.notEqual(before, after);
});

test("decideRegenerate skips existing assets with matching fingerprint", () => {
  const dir = mkdtempSync(join(tmpdir(), "auracle-gen-"));
  const assetPath = join(dir, "t31.mp3");
  writeFileSync(assetPath, "fake");

  assert.equal(
    decideRegenerate({
      fingerprint: "abc123",
      assetPath,
      storedFingerprint: "abc123",
      force: false,
    }),
    "skip",
  );
});

test("decideRegenerate generates when manifest fingerprint changed", () => {
  const dir = mkdtempSync(join(tmpdir(), "auracle-gen-"));
  const assetPath = join(dir, "t31.mp3");
  writeFileSync(assetPath, "fake");

  assert.equal(
    decideRegenerate({
      fingerprint: "newfp",
      assetPath,
      storedFingerprint: "oldfp",
      force: false,
    }),
    "generate",
  );
});

test("coverGenerationFingerprint changes when coverSubject changes", () => {
  const before = coverGenerationFingerprint(artist, album);
  const after = coverGenerationFingerprint(artist, {
    ...album,
    coverSubject: "Different subject.",
  });
  assert.notEqual(before, after);
});

test("artistPhotoGenerationFingerprint changes when photoSubject changes", () => {
  const before = artistPhotoGenerationFingerprint(artist);
  const after = artistPhotoGenerationFingerprint({
    ...artist,
    photoSubject: "Different portrait.",
  });
  assert.notEqual(before, after);
});

test("loadGenerationState defaults covers and artistPhotos", () => {
  const state = loadGenerationState("/nonexistent/generation-state.json");
  assert.deepEqual(state.covers, {});
  assert.deepEqual(state.artistPhotos, {});
});

test("decideRegenerate bootstraps existing assets without stored fingerprint", () => {
  const dir = mkdtempSync(join(tmpdir(), "auracle-gen-"));
  const assetPath = join(dir, "t31.mp3");
  writeFileSync(assetPath, "fake");

  assert.equal(
    decideRegenerate({
      fingerprint: "abc123",
      assetPath,
      storedFingerprint: undefined,
      force: false,
    }),
    "skip",
  );
});
