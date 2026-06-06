import { describe, it, expect, beforeEach } from "vitest";
import type { Condition, SessionIntent } from "@auracle/shared";
import { Db } from "../src/db/index.js";
import { SEED_TRACKS } from "../src/db/seed-data.js";
import { SessionStore } from "../src/session/store.js";
import { HashEmbedder } from "../src/flow/embedder.js";
import { HeuristicFlowModel } from "../src/flow/heuristic-flow.js";
import { createPlan, type PlanDeps } from "../src/flow/plan.js";
import { applyReplan, nudge } from "../src/session/replan-service.js";
import type { ApiContext } from "../src/context.js";

const intent: SessionIntent = { mood: "calm", scene: "study", duration_min: 25 };

async function buildCtx(): Promise<ApiContext> {
  const db = new Db(":memory:");
  const embedder = new HashEmbedder();
  for (const t of SEED_TRACKS) {
    db.upsertTrack({ ...t, embedding: await embedder.embedTrack(t) });
  }
  const planDeps: PlanDeps = { embedder, flowModel: new HeuristicFlowModel(), tracks: () => db.allTracks() };
  const memory = { enabled: false, recall: async () => "", remember: async () => {} };
  return { db, store: new SessionStore(), planDeps, memory };
}

async function startSession(ctx: ApiContext, condition: Condition) {
  const { result, candidatesById } = await createPlan(ctx.planDeps, intent);
  return ctx.store.create({
    intent,
    condition,
    title: result.session_title,
    subtitle: result.session_subtitle,
    arc: result.arc,
    tracklist: result.tracklist,
    candidatesById,
    mem0Context: "",
  });
}

describe("playback pointer", () => {
  let ctx: ApiContext;
  beforeEach(async () => {
    ctx = await buildCtx();
  });

  it("advances the index and marks earlier slots played", async () => {
    const state = await startSession(ctx, "C");
    const third = state.tracklist[2]!.id;
    expect(ctx.store.markStarted(state, third)).toBe(true);
    expect(state.currentTrackIndex).toBe(2);
    expect(state.playedTrackIds).toEqual(state.tracklist.slice(0, 2).map((r) => r.id));
    expect(ctx.store.remaining(state)).toHaveLength(5);
  });
});

describe("applyReplan", () => {
  let ctx: ApiContext;
  beforeEach(async () => {
    ctx = await buildCtx();
  });

  it("keeps the played prefix, swaps remaining, and renumbers contiguously", async () => {
    const state = await startSession(ctx, "C");
    ctx.store.markStarted(state, state.tracklist[2]!.id); // playing slot index 2
    const prefix = state.tracklist.slice(0, 3).map((r) => r.id);

    const out = await applyReplan(ctx, state, { mood: "energetic", energy_delta: "heavier" });

    expect(out.replanned).toBe(true);
    expect(state.tracklist.slice(0, 3).map((r) => r.id)).toEqual(prefix); // played + current unchanged
    expect(state.tracklist.map((r) => r.flow_position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const remainingIds = out.remaining.map((r) => r.id);
    expect(remainingIds.some((id) => prefix.includes(id))).toBe(false); // no replayed tracks
    expect(out.remaining).toHaveLength(5);
  });

  it("is a noop under Condition A (playlist fixed)", async () => {
    const state = await startSession(ctx, "A");
    ctx.store.markStarted(state, state.tracklist[1]!.id);
    const before = state.tracklist.map((r) => r.id);

    const out = await applyReplan(ctx, state, { mood: "energetic" });

    expect(out.replanned).toBe(false);
    expect(state.tracklist.map((r) => r.id)).toEqual(before);
  });
});

describe("nudge", () => {
  it("returns null when energy is unknown", () => {
    expect(nudge(null, "lighter")).toBeNull();
    expect(nudge(null, "heavier")).toBeNull();
    expect(nudge(null, "same")).toBeNull();
  });

  it("shifts energy by one step in the requested direction", () => {
    expect(nudge(3, "lighter")).toBe(2);
    expect(nudge(3, "heavier")).toBe(4);
    expect(nudge(3, "same")).toBe(3);
  });

  it("clamps at the energy floor (1) and ceiling (5)", () => {
    expect(nudge(1, "lighter")).toBe(1);
    expect(nudge(5, "heavier")).toBe(5);
  });
});
