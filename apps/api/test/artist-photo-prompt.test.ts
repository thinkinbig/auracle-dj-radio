import { describe, it, expect } from "vitest";
import { artistPhotoPrompt } from "../src/catalog/artist-photo-prompt.js";

describe("artistPhotoPrompt", () => {
  it("spells out pun homage with iconic markers", () => {
    const prompt = artistPhotoPrompt({
      id: "a-jay-zzz",
      name: "Jay-Zzz",
      persona: "Chillhop for sleepers.",
      punOf: "Jay-Z (Z → Zzz)",
      visualHomage: "Blueprint-era NYC hip-hop with sleep motifs.",
      photoFile: "a-jay-zzz.jpg",
    });
    expect(prompt).toContain("Parody of Jay-Z");
    expect(prompt).toContain("Jay-Zzz");
    expect(prompt).toContain("Iconic markers");
    expect(prompt).toMatch(/no text/i);
  });
});
