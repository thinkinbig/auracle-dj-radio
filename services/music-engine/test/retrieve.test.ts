import { describe, expect, it } from "vitest";
import type { TastePreference } from "@auracle/shared";
import type { TrackRow } from "../src/catalog-db.js";
import { retrieveCandidates, scoreRetrievalCandidate } from "../src/flow/retrieval/retrieve.js";
import { buildTasteScorer } from "../src/flow/weighting/taste-weighting.js";

function row(partial: Partial<TrackRow> & Pick<TrackRow, "id" | "energy" | "scene" | "genreSlug">): TrackRow {
  return {
    title: partial.id,
    artist: "a",
    artistId: "ar",
    albumId: "al",
    albumTitle: "al",
    lore: "",
    albumCoverPath: "",
    artistPhotoPath: "",
    tempo: 90,
    genre: partial.genreSlug,
    artistSlug: "artist",
    albumSlug: "album",
    mood: "calm",
    filePath: "",
    introOffsetMs: null,
    instrumental: true,
    ...partial,
  };
}

function pref(p: Partial<TastePreference> & Pick<TastePreference, "entityType" | "entityId" | "polarity">): TastePreference {
  return { source: "onboarding", ...p };
}

describe("retrieveCandidates (structured scorer)", () => {
  it("calm + study prioritizes energy 1–2 tracks", () => {
    const tracks = [
      row({ id: "e5", energy: 5, scene: "study", genreSlug: "club" }),
      row({ id: "e1", energy: 1, scene: "study", genreSlug: "ambient" }),
      row({ id: "e3", energy: 3, scene: "study", genreSlug: "house" }),
      row({ id: "e2", energy: 2, scene: "study", genreSlug: "chillhop" }),
    ];
    const ranked = retrieveCandidates(tracks, { mood: "calm", scene: "study", limit: 4 });
    expect(ranked.map((t) => t.id)).toEqual(["e1", "e2", "e3", "e5"]);
    expect(ranked.every((t) => t.energy <= 2 || ranked.indexOf(t) >= 2)).toBe(true);
  });

  it("ignores track mood when ranking candidates", () => {
    const tracks = [
      row({ id: "display-mood", energy: 1, scene: "study", genreSlug: "ambient", mood: "stormy archive note" }),
      row({ id: "catalog-mood", energy: 5, scene: "study", genreSlug: "ambient", mood: "calm" }),
    ];
    const ranked = retrieveCandidates(tracks, { mood: "calm", scene: "study", limit: 2 });
    expect(ranked.map((t) => t.id)).toEqual(["display-mood", "catalog-mood"]);
  });

  it("euphoric + party includes energy 4 and 5 in the candidate pool", () => {
    const tracks = Array.from({ length: 10 }, (_, i) =>
      row({
        id: `t${i}`,
        energy: ((i % 5) + 1) as TrackRow["energy"],
        scene: i % 2 === 0 ? "party" : "chill",
        genreSlug: "house",
      }),
    );
    const ranked = retrieveCandidates(tracks, { mood: "euphoric", scene: "party", limit: 8 });
    const energies = new Set(ranked.map((t) => t.energy));
    expect(energies.has(4)).toBe(true);
    expect(energies.has(5)).toBe(true);
  });

  it("taste rerank stays within the mood energy envelope", () => {
    const preferClub = buildTasteScorer([pref({ entityType: "genre", entityId: "club", polarity: "prefer", strength: 3 })]);
    const low = scoreRetrievalCandidate(
      row({ id: "low", energy: 1, scene: "study", genreSlug: "ambient" }),
      { mood: "calm", scene: "study" },
    ).score;
    const highPreferred = scoreRetrievalCandidate(
      row({ id: "high", energy: 5, scene: "study", genreSlug: "club" }),
      { mood: "calm", scene: "study", taste: preferClub },
    ).score;
    expect(low).toBeGreaterThan(highPreferred);
  });

  it("treats mem0 skip penalties as a tie-break, not a mood override", () => {
    const preferArtist = buildTasteScorer([
      pref({ entityType: "artist", entityId: "fav-artist", polarity: "prefer", strength: 3 }),
    ]);
    const calmPreferred = scoreRetrievalCandidate(
      row({ id: "calm-preferred", energy: 2, scene: "study", genreSlug: "ambient", artistSlug: "fav-artist" }),
      { mood: "calm", scene: "study", taste: preferArtist },
    ).score;
    const calmPreferredSkipped = scoreRetrievalCandidate(
      row({ id: "calm-preferred", energy: 2, scene: "study", genreSlug: "ambient", artistSlug: "fav-artist" }),
      { mood: "calm", scene: "study", taste: preferArtist, energyWeights: { 2: 0.7 } },
    ).score;
    const highPreferredSkipped = scoreRetrievalCandidate(
      row({ id: "high-preferred", energy: 5, scene: "study", genreSlug: "ambient", artistSlug: "fav-artist" }),
      { mood: "calm", scene: "study", taste: preferArtist, energyWeights: { 2: 0.7 } },
    ).score;
    expect(calmPreferredSkipped).toBeLessThan(calmPreferred);
    expect(calmPreferredSkipped).toBeGreaterThan(highPreferredSkipped);
  });

  it("normalizes studying → study for scene fit", () => {
    const tracks = [
      row({ id: "match", energy: 1, scene: "study", genreSlug: "ambient" }),
      row({ id: "miss", energy: 1, scene: "gym", genreSlug: "ambient" }),
    ];
    const ranked = retrieveCandidates(tracks, { mood: "calm", scene: "studying", limit: 2 });
    expect(ranked[0]!.id).toBe("match");
  });

  it("scores 30 tracks in under 100ms and 1000 in under 500ms", () => {
    const makeTracks = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        row({
          id: `t${i}`,
          energy: (((i % 5) + 1) as TrackRow["energy"]),
          scene: i % 3 === 0 ? "study" : "party",
          genreSlug: i % 2 === 0 ? "house" : "ambient",
        }),
      );

    const taste: TastePreference[] = [pref({ entityType: "genre", entityId: "house", polarity: "prefer", strength: 2 })];

    const t30 = performance.now();
    retrieveCandidates(makeTracks(30), { mood: "warm", scene: "chill", limit: 24, taste, energyWeights: { 5: 0.5 } });
    expect(performance.now() - t30).toBeLessThan(100);

    const t1000 = performance.now();
    retrieveCandidates(makeTracks(1000), { mood: "uplifting", scene: "commute", limit: 24, taste });
    expect(performance.now() - t1000).toBeLessThan(500);
  });
});
