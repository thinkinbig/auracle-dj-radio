import { describe, it, expect } from "vitest";
import { trackToPrompt } from "../src/music/prompt.js";
import type { Track } from "@auracle/shared";

function sampleTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "t01",
    title: "Paper Lanterns",
    artist: "Lana Del Delay",
    artistId: "a-lana-delay",
    albumId: "alb-lana-delay-midnight",
    albumTitle: "Born to Delay",
    lore: "Lantern loop through delay pedals.",
    albumCoverPath: "data/covers/alb-lana-delay-midnight.jpg",
    artistPhotoPath: "data/artists/a-lana-delay.jpg",
    energy: 1,
    tempo: 62,
    genre: "ambient",
    mood: "calm",
    scene: "study",
    filePath: "data/tracks/t01.mp3",
    introOffsetMs: null,
    instrumental: true,
    ...overrides,
  };
}

describe("trackToPrompt", () => {
  it("requests instrumental for default catalog tracks", () => {
    const prompt = trackToPrompt(sampleTrack());
    expect(prompt).toContain("instrumental only, no vocals, no singing");
    expect(prompt).not.toContain("full song with vocals");
  });

  it("requests vocals when instrumental is false", () => {
    const prompt = trackToPrompt(
      sampleTrack({
        id: "t11",
        artist: "Taylor Drift",
        artistId: "a-taylor-drift",
        genre: "synthwave",
        instrumental: false,
        punOf: "Taylor Swift, specifically her 1989 album era (Swift → Drift)",
        vocalHomage:
          "1989-era bright female pop vocal: crisp enunciation — merged with touge-night adrenaline.",
      }),
    );
    expect(prompt).not.toContain("no vocals");
    expect(prompt).toContain("fictional original vocalist");
    expect(prompt).toContain("1989-era bright female pop vocal");
  });
});
