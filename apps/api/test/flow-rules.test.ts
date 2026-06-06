import { describe, expect, it } from "vitest";
import { adjacentStepPenalty, isAdjacentStepLegal } from "@auracle/shared";

describe("flow-rules", () => {
  const prev = { tempo: 70, energy: 1, genre: "ambient" };

  it("accepts a legal adjacent step", () => {
    expect(isAdjacentStepLegal(prev, { tempo: 80, energy: 2, genre: "lo-fi" })).toBe(true);
    expect(adjacentStepPenalty(prev, { tempo: 80, energy: 2, genre: "lo-fi" })).toBe(0);
  });

  it("penalizes tempo, energy, and genre violations consistently", () => {
    const bad = { tempo: 120, energy: 4, genre: "ambient" };
    expect(isAdjacentStepLegal(prev, bad)).toBe(false);
    expect(adjacentStepPenalty(prev, bad)).toBe(7);
  });
});
