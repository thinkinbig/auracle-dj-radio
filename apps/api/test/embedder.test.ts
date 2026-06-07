import { describe, expect, it } from "vitest";
import { formatEmbedQuery } from "../src/flow/embedder.js";

describe("formatEmbedQuery", () => {
  it("uses feel/doing task prefix for cross-modal retrieval", () => {
    expect(formatEmbedQuery("calm", "study")).toBe(
      "task: search result | query: feel: calm | doing: study",
    );
  });
});
