import { describe, expect, it } from "vitest";
import type { TrackCandidate } from "@auracle/shared";
import { adjacentStepPenalty, isAdjacentStepLegal } from "@auracle/shared";
import { HeuristicFlowModel } from "../src/flow/llm/heuristic-flow.js";
import { chooseNext } from "../src/flow/selection/choose-next.js";
import { validateTracklist } from "../src/flow/validation/validate.js";

function candidate(
  partial: Partial<TrackCandidate> & Pick<TrackCandidate, "id" | "energy" | "tempo" | "genre">,
): TrackCandidate {
  return {
    scene: "study",
    ...partial,
  };
}

describe("chooseNext", () => {
  it("adds adjacency penalty to cost (energy distance + penalties)", () => {
    const prev = candidate({ id: "prev", energy: 2, tempo: 90, genre: "ambient" });
    const sameGenre = candidate({ id: "same", energy: 2, tempo: 90, genre: "ambient" });
    const otherGenre = candidate({ id: "other", energy: 3, tempo: 90, genre: "house" });

    expect(adjacentStepPenalty(prev, sameGenre)).toBe(2);
    expect(isAdjacentStepLegal(prev, sameGenre)).toBe(false);
    expect(isAdjacentStepLegal(prev, otherGenre)).toBe(true);

    // Same energy fit, but genre repeat is penalized — pick the legal step.
    expect(chooseNext([sameGenre, otherGenre], 2, prev)?.id).toBe("other");
  });

  it("avoids tempo jumps when a legal alternative exists", () => {
    const prev = candidate({ id: "prev", energy: 2, tempo: 90, genre: "ambient" });
    const jump = candidate({ id: "jump", energy: 2, tempo: 130, genre: "house" });
    const smooth = candidate({ id: "smooth", energy: 3, tempo: 95, genre: "house" });

    expect(chooseNext([jump, smooth], 2, prev)?.id).toBe("smooth");
  });

  it("returns undefined for an empty pool", () => {
    expect(chooseNext([], 3, undefined)).toBeUndefined();
  });

  it("picks the track closest to the arc target energy", () => {
    const near = candidate({ id: "near", energy: 2, tempo: 90, genre: "ambient" });
    const far  = candidate({ id: "far",  energy: 5, tempo: 90, genre: "house" });
    expect(chooseNext([near, far], 1, undefined)?.id).toBe("near");
  });

  it("starvation: borrows closest energy to target before picking far-away", () => {
    const mid = candidate({ id: "mid", energy: 3, tempo: 90, genre: "ambient" });
    const far = candidate({ id: "far", energy: 5, tempo: 90, genre: "house" });
    // target=1, no energy-1 tracks; energy-3 (distance 2) wins over energy-5 (distance 4)
    expect(chooseNext([mid, far], 1, undefined)?.id).toBe("mid");
  });
});

describe("HeuristicFlowModel adjacent selection", () => {
  it("builds a tracklist with no adjacent-step violations when legal candidates exist", async () => {
    const pool: TrackCandidate[] = [
      candidate({ id: "a1", energy: 1, tempo: 80, genre: "ambient" }),
      candidate({ id: "a2", energy: 2, tempo: 85, genre: "chillhop" }),
      candidate({ id: "a3", energy: 2, tempo: 90, genre: "house" }),
      candidate({ id: "a4", energy: 3, tempo: 95, genre: "downtempo" }),
      candidate({ id: "a5", energy: 3, tempo: 100, genre: "jazz" }),
      candidate({ id: "a6", energy: 4, tempo: 105, genre: "soul" }),
      candidate({ id: "a7", energy: 4, tempo: 110, genre: "funk" }),
      candidate({ id: "a8", energy: 5, tempo: 115, genre: "disco" }),
    ];
    const byId = new Map(pool.map((c) => [c.id, c]));
    const flow = new HeuristicFlowModel();
    const result = await flow.plan({
      intent: { mood: "calm", scene: "study", duration_min: 25 },
      memories: "",
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 8,
      candidates: pool,
    });

    expect(result.tracklist.length).toBe(8);
    expect(validateTracklist(result.tracklist, byId)).toEqual([]);
  });
});
