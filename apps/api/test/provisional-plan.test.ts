import { describe, it, expect, beforeAll } from "vitest";
import type { SessionIntent } from "@auracle/shared";
import { FULL_SESSION_LENGTH } from "@auracle/shared";
import { HashEmbedder } from "../src/flow/embedder.js";
import { HeuristicFlowModel } from "../src/flow/heuristic-flow.js";
import { createProvisionalPlan, type PlanDeps } from "../src/flow/plan.js";
import { SessionStore } from "../src/session/store.js";
import { SEED_TRACKS } from "../src/db/seed-data.js";
import type { TrackRow } from "../src/db/index.js";

let deps: PlanDeps;

beforeAll(async () => {
  const embedder = new HashEmbedder();
  const rows: TrackRow[] = [];
  for (const t of SEED_TRACKS) {
    rows.push({ ...t, embedding: await embedder.embedTrack(t) });
  }
  deps = { embedder, flowModel: new HeuristicFlowModel(), tracks: () => rows };
});

const intent: SessionIntent = { mood: "calm", scene: "study", duration_min: 25 };

describe("createProvisionalPlan", () => {
  it("returns a full 8-slot arc with contiguous positions, no LLM", async () => {
    const { result } = await createProvisionalPlan(deps, intent);
    expect(result.tracklist).toHaveLength(FULL_SESSION_LENGTH);
    expect(result.tracklist.map((r) => r.flow_position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("opens on the lowest-energy candidate (warm-up start)", async () => {
    const { result, candidatesById } = await createProvisionalPlan(deps, intent);
    const energyOf = (id: string) => candidatesById.get(id)!.energy;
    const firstEnergy = energyOf(result.tracklist[0]!.id);
    for (const ref of result.tracklist) {
      expect(firstEnergy).toBeLessThanOrEqual(energyOf(ref.id));
    }
  });
});

describe("SessionStore refine pub/sub", () => {
  function makeState() {
    return new SessionStore().create({
      intent,
      condition: "C",
      title: "t",
      subtitle: "s",
      arc: "warm_up",
      tracklist: [],
      candidatesById: new Map(),
      mem0Context: "",
    });
  }

  it("notifies a subscriber when the refine lands", () => {
    const store = new SessionStore();
    const state = store.create({
      intent, condition: "C", title: "t", subtitle: "s", arc: "warm_up",
      tracklist: [], candidatesById: new Map(), mem0Context: "",
    });
    let fired = 0;
    store.subscribeRefine(state, () => (fired += 1));
    expect(fired).toBe(0);
    store.markRefined(state);
    expect(fired).toBe(1);
  });

  it("replays immediately to a subscriber that attaches after the refine", () => {
    const store = new SessionStore();
    const state = makeState();
    store.markRefined(state);
    let fired = 0;
    store.subscribeRefine(state, () => (fired += 1));
    expect(fired).toBe(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = new SessionStore();
    const state = makeState();
    let fired = 0;
    const off = store.subscribeRefine(state, () => (fired += 1));
    off();
    store.markRefined(state);
    expect(fired).toBe(0);
  });
});
