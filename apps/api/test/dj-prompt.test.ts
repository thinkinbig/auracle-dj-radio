import { describe, it, expect } from "vitest";
import { buildCueText, buildSystemInstruction, DJ_TOOLS } from "../src/live/dj-prompt.js";

describe("buildSystemInstruction", () => {
  const base = { title: "Quiet Hours", subtitle: "25 min · winds down", total: 8, mem0Context: "" };

  it("pins the playlist for condition A", () => {
    const s = buildSystemInstruction({ ...base, condition: "A" });
    expect(s).toContain("playlist is fixed");
    expect(s).not.toContain("triggers a replan");
  });

  it("allows replan for condition C", () => {
    const s = buildSystemInstruction({ ...base, condition: "C" });
    expect(s).toContain("triggers a replan");
  });

  it("falls back when no memory is present", () => {
    expect(buildSystemInstruction({ ...base, condition: "C" })).toContain("no prior preferences");
  });
});

describe("buildCueText", () => {
  const now = { title: "Drift", energy: 2, tempo: 90, genre: "lo-fi" };
  const next = { title: "Haze", energy: 3, tempo: 100, genre: "ambient" };

  it("opens the set on the first cue", () => {
    const t = buildCueText({ kind: "opening", sessionTitle: "Quiet Hours", now, next });
    expect(t).toContain("[opening");
    expect(t).toContain('Open the set "Quiet Hours"');
    expect(t).toContain("Up next");
  });

  it("omits next on the outro", () => {
    const t = buildCueText({ kind: "outro", sessionTitle: "Quiet Hours", now });
    expect(t).toContain("last track");
    expect(t).not.toContain("Up next");
  });
});

describe("DJ_TOOLS", () => {
  it("declares the four intent tools", () => {
    expect(DJ_TOOLS.map((t) => t.name)).toEqual([
      "skip_track",
      "mood_change",
      "pause_playback",
      "record_preference",
    ]);
  });
});
