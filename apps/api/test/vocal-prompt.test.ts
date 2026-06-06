import { describe, it, expect } from "vitest";
import { artistVocalDirection } from "../src/catalog/vocal-prompt.js";

describe("artistVocalDirection", () => {
  it("evokes reference era via vocalHomage without naming a clone target in the homage line", () => {
    const dir = artistVocalDirection(
      {
        name: "Taylor Drift",
        punOf: "Taylor Swift, specifically her 1989 album era (Swift → Drift)",
        vocalHomage:
          "1989-era bright female pop vocal: crisp enunciation, conversational verses — merged with touge-night adrenaline.",
        persona: "Synthwave composer with a drift-racer alter ego.",
      },
      { genre: "synthwave", mood: "energetic", tempo: 120 },
    );
    expect(dir).toContain("Audio parody of Taylor Swift");
    expect(dir).toContain("Taylor Drift");
    expect(dir).toContain("fictional original vocalist");
    expect(dir).toContain("1989-era bright female pop vocal");
    expect(dir).not.toContain("sound like Taylor Swift");
  });
});
