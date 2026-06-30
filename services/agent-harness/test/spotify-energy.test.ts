import { describe, expect, it } from "vitest";
import type { SpotifyTrackRef } from "@auracle/shared";
import { parseEnergyReply } from "../src/session/spotify-energy.js";

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

describe("parseEnergyReply (#74)", () => {
  const tracks = [ref(0), ref(1), ref(2)];

  it("maps index→energy onto the input uris", () => {
    const out = parseEnergyReply(
      [
        { index: 0, energy: 1 },
        { index: 1, energy: 5 },
        { index: 2, energy: 3 },
      ],
      tracks,
    );
    expect(out).toEqual({
      "spotify:track:0": 1,
      "spotify:track:1": 5,
      "spotify:track:2": 3,
    });
  });

  it("falls back to mid energy for skipped, out-of-range, or unparseable entries", () => {
    const out = parseEnergyReply(
      [
        { index: 1, energy: 9 }, // clamped to 5
        { index: 9, energy: 2 }, // out of range → ignored
        { index: 0, energy: "x" }, // unparseable → mid
      ],
      tracks,
    );
    expect(out["spotify:track:0"]).toBe(3); // unparseable
    expect(out["spotify:track:1"]).toBe(5); // clamped
    expect(out["spotify:track:2"]).toBe(3); // skipped by the model
  });

  it("returns an all-mid map when the reply is not an array", () => {
    expect(parseEnergyReply(null, tracks)).toEqual({
      "spotify:track:0": 3,
      "spotify:track:1": 3,
      "spotify:track:2": 3,
    });
  });
});
