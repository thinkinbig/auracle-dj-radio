import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK } from "../src/flow/cosine.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 on length mismatch or empty input", () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("topK", () => {
  it("ranks items by similarity and caps at k", () => {
    const items = [
      { id: "a", v: [1, 0] },
      { id: "b", v: [0.9, 0.1] },
      { id: "c", v: [0, 1] },
    ];
    const ranked = topK([1, 0], items, (i) => i.v, 2);
    expect(ranked.map((r) => r.item.id)).toEqual(["a", "b"]);
  });
});
