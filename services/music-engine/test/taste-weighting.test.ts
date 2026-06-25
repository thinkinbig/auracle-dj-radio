import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import { buildTasteWeighting, tasteCacheKey, type WeightableTrack } from "../src/flow/taste-weighting.js";

const track: WeightableTrack = { id: "t01", genreSlug: "house", artistSlug: "lana-del-delay", albumSlug: "born-to-delay" };

function pref(p: Partial<TastePreference> & Pick<TastePreference, "entityType" | "entityId" | "polarity">): TastePreference {
  return { source: "onboarding", ...p };
}

describe("taste-weighting", () => {
  it("boosts preferred and penalises avoided tracks", () => {
    const prefer = buildTasteWeighting([pref({ entityType: "genre", entityId: "house", polarity: "prefer" })]);
    const avoid = buildTasteWeighting([pref({ entityType: "genre", entityId: "house", polarity: "avoid" })]);
    expect(prefer.multiplierFor(track)).toBeGreaterThan(1);
    expect(avoid.multiplierFor(track)).toBeLessThan(1);
  });

  it("scales with strength", () => {
    const weak = buildTasteWeighting([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 1 })]);
    const strong = buildTasteWeighting([pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 })]);
    expect(strong.multiplierFor(track)).toBeLessThan(weak.multiplierFor(track));
  });

  it("applies the most specific match: track > album > artist > genre", () => {
    // genre says avoid, but a track-level prefer must win for this track.
    const w = buildTasteWeighting([
      pref({ entityType: "genre", entityId: "house", polarity: "avoid", strength: 3 }),
      pref({ entityType: "track", entityId: "t01", polarity: "prefer", strength: 3 }),
    ]);
    expect(w.multiplierFor(track)).toBeGreaterThan(1);

    // artist prefer overrides genre avoid; album avoid overrides artist prefer.
    const artistOverGenre = buildTasteWeighting([
      pref({ entityType: "genre", entityId: "house", polarity: "avoid" }),
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "prefer" }),
    ]);
    expect(artistOverGenre.multiplierFor(track)).toBeGreaterThan(1);

    const albumOverArtist = buildTasteWeighting([
      pref({ entityType: "artist", entityId: "lana-del-delay", polarity: "prefer" }),
      pref({ entityType: "album", entityId: "born-to-delay", polarity: "avoid" }),
    ]);
    expect(albumOverArtist.multiplierFor(track)).toBeLessThan(1);
  });

  it("is a no-op for unmatched tracks and empty prefs", () => {
    const w = buildTasteWeighting([pref({ entityType: "genre", entityId: "ambient", polarity: "avoid" })]);
    expect(w.multiplierFor(track)).toBe(1); // track is house, not ambient
    expect(buildTasteWeighting([]).empty).toBe(true);
    expect(buildTasteWeighting([]).multiplierFor(track)).toBe(1);
  });

  it("produces a stable, order-independent cache key", () => {
    const a = [pref({ entityType: "genre", entityId: "house", polarity: "avoid" }), pref({ entityType: "artist", entityId: "x", polarity: "prefer" })];
    const b = [a[1]!, a[0]!];
    expect(tasteCacheKey(a)).toBe(tasteCacheKey(b));
    expect(tasteCacheKey([])).toBe("");
    expect(tasteCacheKey(undefined)).toBe("");
  });
});
