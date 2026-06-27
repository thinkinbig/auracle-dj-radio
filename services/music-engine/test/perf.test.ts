import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import { CatalogDb, type TrackRow } from "../src/catalog-db.js";
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

  it("catalog DB allTracks() for 1000 rows loads in <1s (startup path)", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "auracle-perf-")), "perf.sqlite");
    const seeder = new CatalogDb(dbPath);
    for (let i = 0; i < 1000; i++) seeder.upsertTrack(row(i));
    seeder.close();

    const db = new CatalogDb(dbPath);
    const t0 = performance.now();
    const rows = db.allTracks();
    const elapsed = performance.now() - t0;
    db.close();

    expect(rows.length).toBe(1000);
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
