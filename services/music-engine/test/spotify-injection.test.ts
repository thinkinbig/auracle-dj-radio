/**
 * ADR-0005 (#73): Spotify candidates are ranked into the same pool as local
 * tracks and the chosen slots carry `source:"spotify"` + inline metadata.
 */
import { describe, expect, it } from "vitest";
import type { Energy, SpotifyTrackRef, Track } from "@auracle/shared";
import { manifestToTracks, loadCatalogManifest } from "../src/catalog/manifest.js";
import { createProvisionalPlan, type PlanDeps } from "../src/flow/plan.js";

const realTracks = manifestToTracks(loadCatalogManifest());
const realDeps: PlanDeps = { tracks: () => realTracks };
const emptyDeps: PlanDeps = { tracks: () => [] };
const intent = { mood: "calm", scene: "study", duration_min: 25 };

/** Minimal catalog row for matching tests; only title/artist/energy/scoring fields matter. */
function track(title: string, artist: string, energy: Energy): Track {
  return {
    id: `local:${title}`,
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

function spotifyCandidate(n: number): SpotifyTrackRef {
  return {
    uri: `spotify:track:test${n}`,
    title: `Spotify Song ${n}`,
    artist: `Artist ${n}`,
    albumTitle: `Album ${n}`,
    albumCoverUrl: `https://img/${n}.jpg`,
    durationSec: 180 + n,
  };
}

describe("Spotify candidate injection", () => {
  it("selects and stamps Spotify slots when the local pool is empty", async () => {
    const cands = Array.from({ length: 8 }, (_, i) => spotifyCandidate(i));
    const { result, candidatesById } = await createProvisionalPlan(
      emptyDeps, intent, "", undefined, undefined, undefined, cands,
    );

    expect(result.tracklist.length).toBeGreaterThan(0);
    for (const ref of result.tracklist) {
      expect(ref.source).toBe("spotify");
      const match = cands.find((c) => c.uri === ref.id);
      expect(match).toBeDefined();
      expect(ref.spotify).toEqual(match);
    }
    // Every candidate is rankable (in the pool), even if not every one was picked.
    for (const c of cands) expect(candidatesById.has(c.uri)).toBe(true);
  });

  it("ranks Spotify candidates into the same pool as the real catalog", async () => {
    const cands = [spotifyCandidate(1), spotifyCandidate(2)];
    const { candidatesById } = await createProvisionalPlan(
      realDeps, intent, "", undefined, undefined, undefined, cands,
    );
    for (const c of cands) expect(candidatesById.has(c.uri)).toBe(true);
  });

  it("reuses catalog energy exactly for a title+artist match (#74)", async () => {
    // Same recording, different casing/punctuation than the catalog row.
    const deps: PlanDeps = { tracks: () => [track("Midnight Drive", "Neon Cat", 5)] };
    const ref: SpotifyTrackRef = {
      uri: "spotify:track:match",
      title: "midnight drive",
      artist: "NEON CAT",
      albumTitle: "Album",
      albumCoverUrl: "https://img/m.jpg",
      durationSec: 200,
    };
    const { candidatesById, spotifyMatchedEnergy } = await createProvisionalPlan(
      deps, intent, "", undefined, undefined, undefined, [ref],
    );
    expect(spotifyMatchedEnergy?.[ref.uri]).toBe(5);
    expect(candidatesById.get(ref.uri)?.energy).toBe(5);
  });

  it("uses provided spotifyEnergyByUri over the placeholder for unmatched tracks (#74)", async () => {
    const cands = [spotifyCandidate(1), spotifyCandidate(2)];
    const energyByUri = { [cands[0]!.uri]: 1 as Energy, [cands[1]!.uri]: 4 as Energy };
    const { candidatesById, spotifyMatchedEnergy } = await createProvisionalPlan(
      emptyDeps, intent, "", undefined, undefined, undefined, cands, energyByUri,
    );
    expect(candidatesById.get(cands[0]!.uri)?.energy).toBe(1);
    expect(candidatesById.get(cands[1]!.uri)?.energy).toBe(4);
    // Nothing matched the (empty) catalog — provided energy came from the LLM map.
    expect(spotifyMatchedEnergy).toEqual({});
  });

  it("leaves a local-only plan unchanged (no source:spotify)", async () => {
    const { result } = await createProvisionalPlan(realDeps, intent);
    expect(result.tracklist.length).toBeGreaterThan(0);
    for (const ref of result.tracklist) {
      expect(ref.source).toBe("local");
      expect(ref.spotify).toBeUndefined();
    }
  });
});
