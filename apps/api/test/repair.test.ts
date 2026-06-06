import { describe, expect, it } from "vitest";
import type { FlowResult, TrackCandidate } from "@auracle/shared";
import { repairTracklist } from "../src/flow/repair.js";
import { validateTracklist } from "../src/flow/validate.js";

function byId(cands: TrackCandidate[]): Map<string, TrackCandidate> {
  return new Map(cands.map((c) => [c.id, c]));
}

describe("repairTracklist", () => {
  it("swaps an illegal adjacent pair from the pool", () => {
    const pool: TrackCandidate[] = [
      { id: "a", energy: 1, tempo: 70, genre: "ambient", mood: "calm", scene: "study" },
      { id: "b", energy: 4, tempo: 120, genre: "ambient", mood: "loud", scene: "gym" },
      { id: "c", energy: 2, tempo: 82, genre: "lo-fi", mood: "mellow", scene: "study" },
    ];
    const result: FlowResult = {
      session_title: "Test",
      session_subtitle: "25 min",
      arc: "build",
      tracklist: [
        { id: "a", flow_position: 1, reason: "" },
        { id: "b", flow_position: 2, reason: "" },
      ],
    };
    const repaired = repairTracklist(result, byId(pool), pool);
    expect(validateTracklist(repaired.tracklist, byId(pool))).toEqual([]);
    expect(repaired.tracklist[1]!.id).toBe("c");
  });
});
