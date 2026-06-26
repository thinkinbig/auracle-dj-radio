import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import { scoreRetrievalCandidate, normalizeCosineScore } from "../src/flow/retrieval/retrieve.js";
import { buildTasteScorer, tasteCacheKey, type WeightableTrack } from "../src/flow/weighting/taste-weighting.js";

const track: WeightableTrack = { id: "t01", genreSlug: "house", artistSlug: "lana-del-delay", albumSlug: "born-to-delay" };

function pref(p: Partial<TastePreference> & Pick<TastePreference, "entityType" | "entityId" | "polarity">): TastePreference {
  return { source: "onboarding", ...p };
}

describe("taste-weighting", () => {
  it("scores preferred and avoided tracks in opposite directions", () => {
    const prefer = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "prefer" })]);
    const avoid = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "avoid" })]);
    expect(prefer.scoreFor(track)).toBeGreaterThan(0);
    expect(avoid.scoreFor(track)).toBeLessThan(0);
  });

  it("scales with strength", () => {
    const weak = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 1 })]);
    const strong = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 })]);
    expect(strong.scoreFor(track)).toBeLessThan(weak.scoreFor(track));
  });

  it("adds matching taste signals but keeps them bounded", () => {
    const mixed = buildTasteScorer([
      pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 }),
      pref({ entityType: "track", entityId: "t01", polarity: "prefer", strength: 3 }),
    ]);
    expect(mixed.scoreFor(track)).toBeGreaterThan(0);
    expect(mixed.scoreFor(track)).toBeLessThanOrEqual(1);

    const stacked = buildTasteScorer([
      pref({ entityType: "track", entityId: "t01", polarity: "prefer", strength: 3 }),
      pref({ entityType: "album", entityId: "born-to-delay", polarity: "prefer", strength: 3 }),
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "prefer", strength: 3 }),
      pref({ entityType: "genre", entityId: "house", polarity: "prefer", strength: 3 }),
    ]);
    expect(stacked.scoreFor(track)).toBe(1);
  });

  it("is a no-op for unmatched tracks and empty prefs", () => {
    const w = buildTasteScorer([pref({ entityType: "genre", entityId: "ambient", polarity: "avoid" })]);
    expect(w.scoreFor(track)).toBe(0); // track is house, not ambient
    expect(buildTasteScorer([]).empty).toBe(true);
    expect(buildTasteScorer([]).scoreFor(track)).toBe(0);
  });

  it("normalizes cosine before applying additive retrieval signals", () => {
    expect(normalizeCosineScore(-1)).toBe(0);
    expect(normalizeCosineScore(0)).toBe(0.5);
    expect(normalizeCosineScore(1)).toBe(1);

    const avoid = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 })]);
    const neutral = scoreRetrievalCandidate({ ...track, energy: 3 }, -0.4).score;
    const avoided = scoreRetrievalCandidate({ ...track, energy: 3 }, -0.4, { taste: avoid }).score;
    expect(avoided).toBeLessThan(neutral);
  });

  it("applies skip-energy as a penalty separate from taste", () => {
    const prefer = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "prefer", strength: 3 })]);
    const noPenalty = scoreRetrievalCandidate({ ...track, energy: 5 }, 0.6, { taste: prefer }).score;
    const skippedEnergy = scoreRetrievalCandidate({ ...track, energy: 5 }, 0.6, { taste: prefer, energyWeights: { 5: 0.7 } }).score;
    expect(skippedEnergy).toBeLessThan(noPenalty);
  });

  it("produces a stable, order-independent cache key", () => {
    const a = [pref({ entityType: "genre", entityId: "house", polarity: "avoid" }), pref({ entityType: "artist", entityId: "x", polarity: "prefer" })];
    const b = [a[1]!, a[0]!];
    expect(tasteCacheKey(a)).toBe(tasteCacheKey(b));
    expect(tasteCacheKey([])).toBe("");
    expect(tasteCacheKey(undefined)).toBe("");
  });
});
