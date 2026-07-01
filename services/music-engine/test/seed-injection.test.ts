/**
 * ADR-0005 (#73): externally-seeded tracks are ranked into the same pool as
 * catalog tracks and the chosen slots are stamped as self-describing PlannedTracks
 * — `uri` carries the playback scheme, metadata/energy/voicing are inline. There is
 * no per-slot provider branch; music-engine resolves seed energy + voicing.
 */
import { describe, expect, it } from "vitest";
import type { Energy, Track, TrackSeed } from "@auracle/shared";
import { manifestToTracks, loadCatalogManifest } from "../src/catalog/manifest.js";
import { createPlan, createProvisionalPlan, extendPlan, replan, type PlanDeps, type SeedResolution } from "../src/flow/plan.js";

const realTracks = manifestToTracks(loadCatalogManifest());
const realDeps: PlanDeps = { tracks: () => realTracks };
const emptyDeps: PlanDeps = { tracks: () => [] };
const intent = { mood: "calm", scene: "study", duration_min: 25 };

/** A resolveSeeds stub: stamps every seed with a fixed energy + voicing. */
function stubResolve(energy: Energy): (seeds: TrackSeed[]) => Promise<SeedResolution> {
  return async (seeds) => ({
    energy: Object.fromEntries(seeds.map((s) => [s.uri, energy])),
    voicing: Object.fromEntries(seeds.map((s) => [s.uri, { artistPersona: `persona ${s.title}`, albumConcept: "concept", lore: "" }])),
  });
}

/** Minimal catalog row for matching tests; only title/artist/energy/scoring fields matter. */
function track(title: string, artist: string, energy: Energy): Track {
  return {
    id: `trk-${title}`,
    title,
    artist,
    artistId: "",
    albumId: "",
    albumTitle: "",
    lore: "",
    artistPersona: "",
    albumConcept: "",
    albumCoverPath: "",
    artistPhotoPath: "",
    energy,
    tempo: 100,
    genre: "ambient",
    genreSlug: "ambient",
    artistSlug: "",
    albumSlug: "",
    mood: "calm",
    scene: "study",
    filePath: "x.mp3",
    introOffsetMs: null,
    instrumental: true,
  };
}

function seed(n: number): TrackSeed {
  return {
    uri: `spotify:track:test${n}`,
    title: `Spotify Song ${n}`,
    artist: `Artist ${n}`,
    albumTitle: `Album ${n}`,
    albumCoverUrl: `https://img/${n}.jpg`,
    durationSec: 180 + n,
  };
}

describe("seed candidate injection", () => {
  it("selects and stamps seeded slots when the catalog pool is empty", async () => {
    const seeds = Array.from({ length: 8 }, (_, i) => seed(i));
    const { result, candidatesById } = await createProvisionalPlan(
      emptyDeps, intent, "", undefined, undefined, undefined, seeds,
    );

    expect(result.tracklist.length).toBeGreaterThan(0);
    for (const ref of result.tracklist) {
      const match = seeds.find((s) => s.uri === ref.id);
      expect(match).toBeDefined();
      // Self-describing: uri is the seed uri, inline metadata comes from the seed.
      expect(ref.uri).toBe(match!.uri);
      expect(ref.title).toBe(match!.title);
      expect(ref.artist).toBe(match!.artist);
      expect(ref.albumCoverUrl).toBe(match!.albumCoverUrl);
      expect(ref.durationSec).toBe(match!.durationSec);
    }
    // Every candidate is rankable (in the pool), even if not every one was picked.
    for (const s of seeds) expect(candidatesById.has(s.uri)).toBe(true);
  });

  it("ranks seeded candidates into the same pool as the real catalog", async () => {
    const seeds = [seed(1), seed(2)];
    const { candidatesById } = await createProvisionalPlan(
      realDeps, intent, "", undefined, undefined, undefined, seeds,
    );
    for (const s of seeds) expect(candidatesById.has(s.uri)).toBe(true);
  });

  it("reuses catalog energy exactly for a title+artist match (#74)", async () => {
    // Same recording, different casing/punctuation than the catalog row.
    const deps: PlanDeps = { tracks: () => [track("Midnight Drive", "Neon Cat", 5)] };
    const ref: TrackSeed = {
      uri: "spotify:track:match",
      title: "midnight drive",
      artist: "NEON CAT",
      albumTitle: "Album",
      albumCoverUrl: "https://img/m.jpg",
      durationSec: 200,
    };
    const { candidatesById } = await createProvisionalPlan(
      deps, intent, "", undefined, undefined, undefined, [ref],
    );
    expect(candidatesById.get(ref.uri)?.energy).toBe(5);
  });

  it("reuses catalog DJ voicing verbatim for a title+artist match, inline on the slot (#75)", async () => {
    const matched = {
      ...track("Midnight Drive", "Neon Cat", 5),
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
      lore: "Cut in one take at 3am",
    };
    const deps: PlanDeps = { tracks: () => [matched] };
    const ref: TrackSeed = {
      uri: "spotify:track:match",
      title: "midnight drive",
      artist: "NEON CAT",
      albumTitle: "Album",
      albumCoverUrl: "https://img/m.jpg",
      durationSec: 200,
    };
    const { result } = await createProvisionalPlan(deps, intent, "", undefined, undefined, undefined, [ref]);
    const slot = result.tracklist.find((r) => r.id === ref.uri);
    expect(slot?.voicing).toEqual({
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
      lore: "Cut in one take at 3am",
    });
  });

  it("stamps placeholder energy + empty voicing for an unmatched seed on the provisional path (#75)", async () => {
    const { result, candidatesById } = await createProvisionalPlan(
      emptyDeps, intent, "", undefined, undefined, undefined, [seed(1)],
    );
    const slot = result.tracklist.find((r) => r.id === seed(1).uri);
    expect(slot?.voicing).toEqual({ artistPersona: "", albumConcept: "", lore: "" });
    // No catalog match, no resolver on the provisional path → mid-arc placeholder.
    expect(candidatesById.get(seed(1).uri)?.energy).toBe(3);
  });

  it("resolves unmatched seed energy + voicing via resolveSeeds on the full plan (#74/#75)", async () => {
    const deps: PlanDeps = { tracks: () => [], resolveSeeds: stubResolve(1) };
    const seeds = [seed(1), seed(2)];
    const { result, candidatesById } = await createPlan(deps, intent, "", undefined, undefined, undefined, seeds);
    for (const s of seeds) expect(candidatesById.get(s.uri)?.energy).toBe(1);
    for (const ref of result.tracklist) {
      expect(ref.voicing.artistPersona).toBe(`persona ${ref.title}`);
    }
  });

  it("leaves a catalog-only plan self-describing under the local: scheme", async () => {
    const { result } = await createProvisionalPlan(realDeps, intent);
    expect(result.tracklist.length).toBeGreaterThan(0);
    for (const ref of result.tracklist) {
      expect(ref.uri.startsWith("local:")).toBe(true);
      expect(ref.title.length).toBeGreaterThan(0);
    }
  });

  it("re-ranks the cached seed pool into a regenerate, stamping inline metadata (#77)", async () => {
    const seeds = [seed(1), seed(2)];
    const p = await replan(emptyDeps, {
      intent,
      playedIds: [],
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 2,
      seeds,
    });
    expect(p.result.tracklist.length).toBeGreaterThan(0);
    for (const ref of p.result.tracklist) {
      const match = seeds.find((s) => s.uri === ref.id);
      expect(ref.uri).toBe(match!.uri);
      expect(ref.title).toBe(match!.title);
    }
  });

  it("excludes already-played/kept seed uris from a re-rank (#77)", async () => {
    const seeds = [seed(1), seed(2), seed(3)];
    const p = await replan(emptyDeps, {
      intent,
      playedIds: [seeds[0]!.uri],
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 5,
      seeds,
    });
    expect(p.result.tracklist.map((r) => r.id)).not.toContain(seeds[0]!.uri);
  });

  it("appends mixed seeded tracks on rolling extend, excluding queued uris (#77)", async () => {
    const seeds = [seed(1), seed(2)];
    const p = await extendPlan(emptyDeps, {
      intent,
      playedIds: [seeds[0]!.uri], // already queued → must not reappear
      appendSlots: 4,
      lastPlayedEnergy: 3,
      seeds,
    });
    const ids = p.result.tracklist.map((r) => r.id);
    expect(ids).not.toContain(seeds[0]!.uri);
    expect(ids).toContain(seeds[1]!.uri);
    for (const ref of p.result.tracklist) {
      expect(ref.uri.startsWith("spotify:")).toBe(true);
    }
  });
});
