import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import { scoreRetrievalCandidate } from "../src/flow/retrieval/retrieve.js";
import { buildTasteScorer, tasteCacheKey, type WeightableTrack } from "../src/flow/weighting/taste-weighting.js";

const track: WeightableTrack & { energy: number; scene: string } = {
  id: "t01",
  genreSlug: "house",
  artistSlug: "lana-del-delay",
  albumSlug: "born-to-delay",
  energy: 3,
  scene: "study",
};

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

  it("applies taste as additive structured retrieval signal", () => {
    const avoid = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 })]);
    const neutral = scoreRetrievalCandidate(track, { mood: "focused", scene: "study" }).score;
    const avoided = scoreRetrievalCandidate(track, { mood: "focused", scene: "study", taste: avoid }).score;
    expect(avoided).toBeLessThan(neutral);
  });

  it("applies skip-energy as a penalty separate from taste", () => {
    const prefer = buildTasteScorer([pref({ entityType: "genre", entityId: "house", polarity: "prefer", strength: 3 })]);
    const noPenalty = scoreRetrievalCandidate({ ...track, energy: 5 }, { mood: "euphoric", scene: "party", taste: prefer }).score;
    const skippedEnergy = scoreRetrievalCandidate(
      { ...track, energy: 5 },
      { mood: "euphoric", scene: "party", taste: prefer, energyWeights: { 5: 0.7 } },
    ).score;
    expect(skippedEnergy).toBeLessThan(noPenalty);
  });

  // #69: voice like/dislike persists as a TastePreference with `source: "session"`,
  // and plan/replan weighting must read it identically to onboarding-sourced prefs so
  // feedback measurably changes future selections (the cross-session taste loop).
  it("downranks an artist avoided via session feedback (source: session)", () => {
    const sessionAvoid = buildTasteScorer([
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "avoid", source: "session", strength: 2 }),
    ]);
    const neutral = scoreRetrievalCandidate(track, { mood: "focused", scene: "study" }).score;
    const avoided = scoreRetrievalCandidate(track, { mood: "focused", scene: "study", taste: sessionAvoid }).score;
    expect(avoided).toBeLessThan(neutral);
  });

  it("treats session-sourced prefer/avoid symmetrically with onboarding source", () => {
    const onboardingAvoid = buildTasteScorer([
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "avoid", source: "onboarding", strength: 2 }),
    ]);
    const sessionAvoid = buildTasteScorer([
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "avoid", source: "session", strength: 2 }),
    ]);
    // Source is provenance only — it must not change the weighting magnitude.
    expect(sessionAvoid.scoreFor(track)).toBe(onboardingAvoid.scoreFor(track));
  });

  it("produces a stable, order-independent cache key", () => {
    const a = [pref({ entityType: "genre", entityId: "house", polarity: "avoid" }), pref({ entityType: "artist", entityId: "x", polarity: "prefer" })];
    const b = [a[1]!, a[0]!];
    expect(tasteCacheKey(a)).toBe(tasteCacheKey(b));
    expect(tasteCacheKey([])).toBe("");
    expect(tasteCacheKey(undefined)).toBe("");
  });
});
