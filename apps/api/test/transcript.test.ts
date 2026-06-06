import { describe, expect, it } from "vitest";
import { TranscriptAccumulator } from "../src/live/transcript.js";

describe("TranscriptAccumulator", () => {
  it("accumulates user fragments into streaming full text", () => {
    const acc = new TranscriptAccumulator();
    expect(acc.ingest("user", { text: "Good" })).toBe("Good");
    expect(acc.ingest("user", { text: " morning" })).toBe("Good morning");
  });

  it("resets user buffer after finished", () => {
    const acc = new TranscriptAccumulator();
    acc.ingest("user", { text: "Hello" });
    acc.ingest("user", { text: " there", finished: true });
    expect(acc.ingest("user", { text: "Thanks" })).toBe("Thanks");
  });

  it("accumulates model fragments with English spacing", () => {
    const acc = new TranscriptAccumulator();
    expect(acc.ingest("model", { text: "Hi" })).toBe("Hi");
    expect(acc.ingest("model", { text: " there" })).toBe("Hi there");
  });

  it("resetTurn clears both buffers", () => {
    const acc = new TranscriptAccumulator();
    acc.ingest("user", { text: "hey" });
    acc.ingest("model", { text: "Hi" });
    acc.resetTurn();
    expect(acc.ingest("model", { text: "Good" })).toBe("Good");
  });
});
