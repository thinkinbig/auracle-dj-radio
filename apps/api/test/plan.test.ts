import { describe, it, expect, beforeAll } from "vitest";
import type { SessionIntent } from "@auracle/shared";
import { FULL_SESSION_LENGTH } from "@auracle/shared";
import { HashEmbedder, trackTagText } from "../src/flow/embedder.js";
import { HeuristicFlowModel } from "../src/flow/heuristic-flow.js";
import { createPlan, replan, type PlanDeps } from "../src/flow/plan.js";
import { validateTracklist } from "../src/flow/validate.js";
import { SEED_TRACKS } from "../src/db/seed-data.js";
import type { TrackRow } from "../src/db/index.js";

let deps: PlanDeps;

beforeAll(async () => {
  const embedder = new HashEmbedder();
  const rows: TrackRow[] = [];
  for (const t of SEED_TRACKS) {
    rows.push({ ...t, embedding: await embedder.embed(trackTagText(t)) });
  }
  deps = { embedder, flowModel: new HeuristicFlowModel(), tracks: () => rows };
});

const intent: SessionIntent = { mood: "calm", scene: "study", duration_min: 25 };

describe("createPlan", () => {
  it("produces a full 8-slot arc with no rule violations", async () => {
    const { result, violations, candidatesById } = await createPlan(deps, intent);
    expect(result.tracklist).toHaveLength(FULL_SESSION_LENGTH);
    expect(result.tracklist.map((r) => r.flow_position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(validateTracklist(result.tracklist, candidatesById)).toEqual([]);
    expect(violations).toEqual([]);
  });

  it("rises from a low warm-up energy toward a higher peak", async () => {
    const { result, candidatesById } = await createPlan(deps, intent);
    const energyAt = (i: number) => candidatesById.get(result.tracklist[i]!.id)!.energy;
    expect(energyAt(0)).toBeLessThanOrEqual(2);
    expect(Math.max(...result.tracklist.map((_, i) => energyAt(i)))).toBeGreaterThanOrEqual(4);
  });
});

describe("replan", () => {
  it("excludes played tracks and fills only the remaining slots", async () => {
    const playedIds = ["t01", "t02", "t03"];
    const { result } = await replan(deps, {
      intent,
      playedIds,
      played: [],
      lastPlayedEnergy: 3,
      remainingSlots: 5,
    });
    expect(result.tracklist).toHaveLength(5);
    expect(result.tracklist.some((r) => playedIds.includes(r.id))).toBe(false);
  });
});
