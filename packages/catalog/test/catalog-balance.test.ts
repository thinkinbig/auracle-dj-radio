import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogManifest } from "@auracle/shared";
import { checkCatalogBalance, rankForIntent, scoreTrack } from "../src/catalog-balance.js";

const mini: CatalogManifest = {
  artists: [
    { id: "a1", name: "Lana", slug: "lana-del-delay", persona: "", punOf: "", visualHomage: "", photoFile: "a.jpg" },
    { id: "a2", name: "Jay", slug: "jay-zzz", persona: "", punOf: "", visualHomage: "", photoFile: "b.jpg" },
  ],
  albums: [
    { id: "al1", artistId: "a1", title: "Delay", slug: "born-to-delay", concept: "", coverFile: "c.jpg" },
    { id: "al2", artistId: "a2", title: "Nap", slug: "the-blueprint-nap", concept: "", coverFile: "d.jpg" },
  ],
  tracks: [
    {
      id: "t01",
      albumId: "al1",
      title: "A",
      energy: 1,
      tempo: 60,
      genre: "ambient",
      genreSlug: "ambient",
      mood: "calm",
      scene: "study",
      filePath: "data/tracks/t01.mp3",
      introOffsetMs: null,
      lore: "",
    },
    {
      id: "t02",
      albumId: "al1",
      title: "B",
      energy: 1,
      tempo: 64,
      genre: "lo-fi",
      genreSlug: "lo-fi",
      mood: "calm",
      scene: "study",
      filePath: "data/tracks/t02.mp3",
      introOffsetMs: null,
      lore: "",
    },
    {
      id: "t03",
      albumId: "al2",
      title: "C",
      energy: 2,
      tempo: 80,
      genre: "chillhop",
      genreSlug: "chillhop",
      mood: "mellow",
      scene: "study",
      filePath: "data/tracks/t03.mp3",
      introOffsetMs: null,
      lore: "",
    },
  ],
};

test("ranks calm+study by energy before scene-only matches", () => {
  const tracks = [
    { id: "e1", energy: 1, scene: "study", genreSlug: "ambient", artistSlug: "lana-del-delay", albumSlug: "a", mood: "calm" },
    { id: "e5", energy: 5, scene: "study", genreSlug: "house", artistSlug: "x", albumSlug: "b", mood: "euphoric" },
    { id: "e1c", energy: 1, scene: "chill", genreSlug: "ambient", artistSlug: "y", albumSlug: "c", mood: "calm" },
  ];
  const ranked = rankForIntent(tracks, "calm", "study");
  assert.equal(ranked[0]!.id, "e1");
  assert.equal(ranked.at(-1)!.id, "e5");
});

test("genre prefer cannot override calm envelope", () => {
  const low = scoreTrack(
    { id: "low", energy: 1, scene: "study", genreSlug: "ambient", artistSlug: "a", albumSlug: "al", mood: "calm" },
    "calm",
    "study",
  );
  const high = scoreTrack(
    { id: "high", energy: 5, scene: "study", genreSlug: "house", artistSlug: "b", albumSlug: "al", mood: "euphoric" },
    "calm",
    "study",
    [{ entityType: "genre", entityId: "house", polarity: "prefer", source: "onboarding", strength: 3 }],
  );
  assert.ok(low > high);
});

test("does not validate track mood against session mood taxonomy", () => {
  const displayMood: CatalogManifest = {
    ...mini,
    tracks: [{ ...mini.tracks[0]!, mood: "rainy basement afterparty" }],
  };
  const report = checkCatalogBalance(displayMood, { goal: 3 });
  assert.equal(report.failed, 0);
  assert.ok(!report.checks.some((c) => c.id.startsWith("mood:")));
});

test("reports metadata failures on invalid scene", () => {
  const bad: CatalogManifest = {
    ...mini,
    tracks: [{ ...mini.tracks[0]!, scene: "late-night-study" }],
  };
  const report = checkCatalogBalance(bad, { goal: 3 });
  assert.ok(report.failed > 0);
  assert.ok(report.checks.some((c) => c.id.startsWith("scene:")));
});

test("passes taxonomy checks on a minimal valid manifest", () => {
  const report = checkCatalogBalance(mini, { goal: 3 });
  assert.equal(report.failed, 0);
});
