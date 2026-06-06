import { describe, it, expect } from "vitest";
import { inferHostModeFromScene } from "@auracle/shared";
import { buildCueText, buildSystemInstruction, DJ_TOOLS, vibeHint } from "../src/live/dj-prompt.js";

describe("inferHostModeFromScene", () => {
  it("maps gym to hype", () => {
    expect(inferHostModeFromScene("gym")).toBe("hype");
  });

  it("maps study to curator (guide)", () => {
    expect(inferHostModeFromScene("study")).toBe("curator");
  });

  it("maps commute to curator", () => {
    expect(inferHostModeFromScene("commute")).toBe("curator");
  });

  it("defaults chill to curator (guide)", () => {
    expect(inferHostModeFromScene("chill")).toBe("curator");
  });
});

describe("vibeHint", () => {
  it("uses natural language without numbers", () => {
    const hint = vibeHint({
      title: "Drift",
      artist: "Lumen",
      albumTitle: "Midnight Commute",
      energy: 2,
      tempo: 90,
      genre: "lo-fi",
    });
    expect(hint).toContain("soft");
    expect(hint).toContain("lo-fi");
    expect(hint).not.toMatch(/\d/);
  });
});

describe("buildSystemInstruction", () => {
  const base = {
    title: "Quiet Hours",
    subtitle: "25 min · winds down",
    total: 8,
    mem0Context: "",
    hostMode: "set_dj" as const,
    mood: "calm",
    scene: "chill",
  };

  it("uses live set DJ persona", () => {
    const s = buildSystemInstruction({ ...base, condition: "C" });
    expect(s).toContain("live set DJ");
    expect(s).not.toContain("radio host");
    expect(s).toContain("HOST MODE: set_dj");
    expect(s).toContain("mood=calm");
  });

  it("pins the playlist for condition A", () => {
    const s = buildSystemInstruction({ ...base, condition: "A" });
    expect(s).toContain("playlist is fixed");
    expect(s).not.toContain("replan remaining");
  });

  it("allows replan for condition C", () => {
    const s = buildSystemInstruction({ ...base, condition: "C" });
    expect(s).toContain("replan remaining tracks");
    expect(s).toContain("change_host_mode");
  });

  it("falls back when no memory is present", () => {
    expect(buildSystemInstruction({ ...base, condition: "C" })).toContain("no prior preferences");
  });
});

describe("buildCueText", () => {
  const now = {
    title: "Drift",
    artist: "Lumen",
    albumTitle: "Midnight Commute",
    energy: 2,
    tempo: 90,
    genre: "lo-fi",
    lore: "Written after a rainy night bus ride — soft pads and tape hiss.",
  };
  const next = {
    title: "Haze",
    artist: "Kova",
    albumTitle: "Neon District",
    energy: 3,
    tempo: 100,
    genre: "ambient",
  };

  it("opens with talk-over framing and no up next", () => {
    const t = buildCueText({ kind: "opening", hostMode: "set_dj", sessionTitle: "Quiet Hours", now, next });
    expect(t).toContain("[opening, set_dj, 5-8s]");
    expect(t).toContain("Music is silent");
    expect(t).toContain("preloading but not playing");
    expect(t).toContain('Track: "Drift" by Lumen');
    expect(t).toContain("vibe:");
    expect(t).not.toContain("Up next");
    expect(t).not.toContain("BPM");
    expect(t).not.toContain("2/5");
    expect(t).toContain("Example tone:");
  });

  it("lets curator optionally mention set name", () => {
    const t = buildCueText({ kind: "opening", hostMode: "curator", sessionTitle: "Quiet Hours", now });
    expect(t).toContain('Set name "Quiet Hours"');
    expect(t).toContain("[opening, curator, 8-12s]");
  });

  it("omits set name hint for set_dj", () => {
    const t = buildCueText({ kind: "opening", hostMode: "set_dj", sessionTitle: "Quiet Hours", now });
    expect(t).not.toContain("Set name");
    expect(t).not.toContain("Lore hint");
  });

  it("segue includes next with vibe hint not stats", () => {
    const t = buildCueText({ kind: "segue", hostMode: "set_dj", sessionTitle: "Quiet Hours", now, next });
    expect(t).toContain('Next: "Haze" by Kova');
    expect(t).toContain("vibe:");
    expect(t).not.toContain("BPM");
    expect(t).not.toContain("Lore hint");
  });

  it("curator segue includes lore hint", () => {
    const t = buildCueText({ kind: "segue", hostMode: "curator", sessionTitle: "Quiet Hours", now, next });
    expect(t).toContain("Lore hint");
    expect(t).toContain("do not read verbatim");
    expect(t).toContain("rainy night bus ride");
  });

  it("omits next on the outro", () => {
    const t = buildCueText({ kind: "outro", hostMode: "set_dj", sessionTitle: "Quiet Hours", now });
    expect(t).toMatch(/last track/i);
    expect(t).not.toContain("Up next");
    expect(t).not.toContain('Next: "');
  });
});

describe("DJ_TOOLS", () => {
  it("declares the five intent tools", () => {
    expect(DJ_TOOLS.map((t) => t.name)).toEqual([
      "skip_track",
      "mood_change",
      "change_host_mode",
      "pause_playback",
      "record_preference",
    ]);
  });
});
