/**
 * ADR-0005 (#73): Spotify candidates are ranked into the same pool as local
 * tracks and the chosen slots carry `source:"spotify"` + inline metadata.
 */
import { describe, expect, it } from "vitest";
import type { SpotifyTrackRef } from "@auracle/shared";
import { manifestToTracks, loadCatalogManifest } from "../src/catalog/manifest.js";
import { createProvisionalPlan, type PlanDeps } from "../src/flow/plan.js";

const realTracks = manifestToTracks(loadCatalogManifest());
const realDeps: PlanDeps = { tracks: () => realTracks };
const emptyDeps: PlanDeps = { tracks: () => [] };
const intent = { mood: "calm", scene: "study", duration_min: 25 };

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

  it("leaves a local-only plan unchanged (no source:spotify)", async () => {
    const { result } = await createProvisionalPlan(realDeps, intent);
    expect(result.tracklist.length).toBeGreaterThan(0);
    for (const ref of result.tracklist) {
      expect(ref.source).toBe("local");
      expect(ref.spotify).toBeUndefined();
    }
  });
});
