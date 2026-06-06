import { describe, it, expect } from "vitest";
import { buildCoverOverlaySvg, escapeXml } from "../src/catalog/cover-overlay.js";

describe("escapeXml", () => {
  it("escapes characters that break SVG", () => {
    expect(escapeXml(`Rock & "Roll"`)).toBe("Rock &amp; &quot;Roll&quot;");
  });
});

describe("buildCoverOverlaySvg", () => {
  it("includes artist and album title with safe escaping", () => {
    const svg = buildCoverOverlaySvg(
      `Suit & Stripes`,
      `Justin Tiger`,
      1024,
      "/fonts/regular.woff",
      "/fonts/bold.woff",
    );
    expect(svg).toContain("JUSTIN TIGER");
    expect(svg).toContain("Suit &amp; Stripes");
    expect(svg).not.toContain("Suit & Stripes");
    expect(svg).toContain('file:///fonts/bold.woff');
  });

  it("fits long album titles within the cover width", () => {
    const svg = buildCoverOverlaySvg(
      "Animals (Instrumentals Only)",
      "Martin Garage",
      1024,
      "/fonts/regular.woff",
      "/fonts/bold.woff",
    );
    expect(svg).toContain('textLength="902"');
    expect(svg).toContain("lengthAdjust");
  });
});
