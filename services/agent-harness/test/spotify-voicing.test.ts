import { describe, expect, it } from "vitest";
import type { SpotifyTrackRef } from "@auracle/shared";
import { parseVoicingReply } from "../src/session/spotify-voicing.js";

function ref(n: number): SpotifyTrackRef {
  return {
    uri: `spotify:track:${n}`,
    title: `Song ${n}`,
    artist: `Artist ${n}`,
    albumTitle: `Album ${n}`,
    albumCoverUrl: `https://img/${n}.jpg`,
    durationSec: 180,
  };
}

describe("parseVoicingReply (#75)", () => {
  const tracks = [ref(0), ref(1), ref(2)];

  it("maps index→voicing onto the input uris, with empty lore (catalog-only)", () => {
    const out = parseVoicingReply(
      [
        { index: 0, artistPersona: "Neon dream-pop drifter", albumConcept: "A midnight city in soft focus" },
        { index: 2, artistPersona: "Restless garage romantic", albumConcept: "Tape hiss and first crushes" },
      ],
      tracks,
    );
    expect(out["spotify:track:0"]).toEqual({
      artistPersona: "Neon dream-pop drifter",
      albumConcept: "A midnight city in soft focus",
      lore: "",
    });
    expect(out["spotify:track:2"]).toEqual({
      artistPersona: "Restless garage romantic",
      albumConcept: "Tape hiss and first crushes",
      lore: "",
    });
    // index 1 was skipped by the model → no voicing → DJ falls back to title/artist.
    expect(out["spotify:track:1"]).toBeUndefined();
  });

  it("trims whitespace and keeps a row with only one field set", () => {
    const out = parseVoicingReply(
      [{ index: 1, artistPersona: "  Lone synth wanderer  ", albumConcept: "   " }],
      tracks,
    );
    expect(out["spotify:track:1"]).toEqual({
      artistPersona: "Lone synth wanderer",
      albumConcept: "",
      lore: "",
    });
  });

  it("drops out-of-range, blank-both, and unparseable rows", () => {
    const out = parseVoicingReply(
      [
        { index: 9, artistPersona: "x", albumConcept: "y" }, // out of range
        { index: 0, artistPersona: "  ", albumConcept: "" }, // both blank → dropped
        { index: "z", artistPersona: "x", albumConcept: "y" }, // unparseable index
      ],
      tracks,
    );
    expect(out).toEqual({});
  });

  it("returns an empty map when the reply is not an array", () => {
    expect(parseVoicingReply(null, tracks)).toEqual({});
  });
});
