import { describe, it, expect } from "vitest";
import type { FlowTrackRef, TrackCandidate } from "@auracle/shared";
import { validateTracklist } from "../src/flow/validate.js";

function byId(cands: TrackCandidate[]): Map<string, TrackCandidate> {
  return new Map(cands.map((c) => [c.id, c]));
}

const refs = (ids: string[]): FlowTrackRef[] =>
  ids.map((id, i) => ({ id, flow_position: i + 1, reason: "" }));

describe("validateTracklist", () => {
  it("passes a clean arc", () => {
    const cands: TrackCandidate[] = [
      { id: "a", energy: 1, tempo: 70, genre: "ambient", mood: "calm", scene: "study" },
      { id: "b", energy: 2, tempo: 80, genre: "lo-fi", mood: "mellow", scene: "study" },
      { id: "c", energy: 3, tempo: 92, genre: "downtempo", mood: "warm", scene: "focus" },
    ];
    expect(validateTracklist(refs(["a", "b", "c"]), byId(cands))).toEqual([]);
  });

  it("flags tempo, energy, and genre violations", () => {
    const cands: TrackCandidate[] = [
      { id: "a", energy: 1, tempo: 70, genre: "ambient", mood: "calm", scene: "study" },
      { id: "b", energy: 4, tempo: 120, genre: "ambient", mood: "loud", scene: "gym" },
    ];
    const kinds = validateTracklist(refs(["a", "b"]), byId(cands)).map((v) => v.kind);
    expect(kinds).toContain("tempo_jump");
    expect(kinds).toContain("energy_jump");
    expect(kinds).toContain("genre_repeat");
  });

  it("flags unknown tracks and non-contiguous positions", () => {
    const cands: TrackCandidate[] = [
      { id: "a", energy: 1, tempo: 70, genre: "ambient", mood: "calm", scene: "study" },
    ];
    const bad: FlowTrackRef[] = [{ id: "ghost", flow_position: 2, reason: "" }];
    const kinds = validateTracklist(bad, byId(cands)).map((v) => v.kind);
    expect(kinds).toContain("unknown_track");
    expect(kinds).toContain("non_contiguous");
  });
});
