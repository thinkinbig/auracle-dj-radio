import { describe, it, expect } from "vitest";
import { albumCoverPrompt } from "../src/catalog/cover-prompt.js";

describe("albumCoverPrompt", () => {
  it("spells out pun homage explicitly for image models", () => {
    const prompt = albumCoverPrompt(
      {
        id: "alb-test",
        artistId: "a-jay-zzz",
        title: "The Blueprint Nap",
        concept: "Study-session classic.",
        coverFile: "test.jpg",
        coverSubject: "Echo The Blueprint grid with sleep motifs.",
      },
      {
        id: "a-jay-zzz",
        name: "Jay-Zzz",
        persona: "Chillhop for sleepers.",
        punOf: "Jay-Z (Z → Zzz)",
        visualHomage: "Blueprint-era NYC hip-hop packaging with sleep motifs.",
        photoFile: "a-jay-zzz.jpg",
      },
    );
    expect(prompt).toContain("Parody of Jay-Z");
    expect(prompt).toContain("source album homage");
    expect(prompt).toContain("no text");
    expect(prompt).not.toContain("typography");
  });
});
