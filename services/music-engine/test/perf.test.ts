import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import { Catalog, type TrackRow } from "../src/catalog-store.js";
import { retrieveCandidates } from "../src/flow/retrieval/retrieve.js";

function row(i: number): TrackRow {
  return {
    id: `t${i}`,
    title: `Track ${i}`,
    artist: "Artist",
    artistId: "ar",
    albumId: "al",
    albumTitle: "Album",
    lore: "",
    albumCoverPath: "",
    artistPhotoPath: "",
    energy: (((i % 5) + 1) as TrackRow["energy"]),
    tempo: 90 + (i % 40),
    genre: i % 2 === 0 ? "house" : "ambient",
    genreSlug: i % 2 === 0 ? "house" : "ambient",
    artistSlug: "artist",
    albumSlug: "album",
    mood: "calm",
    scene: i % 3 === 0 ? "study" : "party",
    filePath: "",
    introOffsetMs: null,
    instrumental: true,
  };
}

const taste: TastePreference[] = [
  { entityType: "genre", entityId: "house", polarity: "prefer", strength: 2, source: "onboarding" },
];

describe("P5.3 retrieval performance (no embedding path)", () => {
  it("30-track retrieval completes in <20ms", () => {
    const tracks = Array.from({ length: 30 }, (_, i) => row(i));
    const t0 = performance.now();
    retrieveCandidates(tracks, { mood: "calm", scene: "study", limit: 24, taste, energyWeights: { 5: 0.5 } });
    expect(performance.now() - t0).toBeLessThan(20);
  });

  it("1000-track retrieval completes in <100ms", () => {
    const tracks = Array.from({ length: 1000 }, (_, i) => row(i));
    const t0 = performance.now();
    retrieveCandidates(tracks, { mood: "uplifting", scene: "commute", limit: 24, taste });
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("in-memory catalog for 1000 rows loads + indexes in <1s (startup path)", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(i));
    const t0 = performance.now();
    const catalog = new Catalog(rows);
    const all = catalog.allTracks();
    const one = catalog.getTrack("t500");
    const elapsed = performance.now() - t0;

    expect(all.length).toBe(1000);
    expect(one?.id).toBe("t500");
    expect(elapsed).toBeLessThan(1000);
  });

  it("music-engine has no Qdrant dependency", () => {
    const pkgPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(allDeps).filter((k) => k.includes("qdrant"))).toHaveLength(0);
  });
});
