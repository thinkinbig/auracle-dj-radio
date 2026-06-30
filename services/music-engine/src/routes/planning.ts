import type { FastifyInstance } from "fastify";
import type { Energy, SessionIntent, SpotifyTrackRef, TastePreference, TrackCandidate } from "@auracle/shared";
import { createPlanCached, createProvisionalPlan, extendPlan, replan, type PlanDeps, type PlanResult } from "../flow/plan.js";
import { retrieveCandidates } from "../flow/retrieval/retrieve.js";

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

/** Flatten a PlanResult for the wire: candidatesById Map -> TrackCandidate[]. */
function toPlanResponse(p: PlanResult): {
  result: PlanResult["result"];
  violations: PlanResult["violations"];
  candidates: TrackCandidate[];
  spotifyMatchedEnergy?: Record<string, Energy>;
} {
  return { result: p.result, violations: p.violations, candidates: [...p.candidatesById.values()], spotifyMatchedEnergy: p.spotifyMatchedEnergy };
}

export function registerPlanningRoutes(app: FastifyInstance, deps: PlanDeps): void {
  // Step 1 retrieval: structured mood/scene scoring, return top-K candidates.
  app.post("/search_catalog", async (req, reply) => {
    const b = (req.body ?? {}) as { mood?: string; scene?: string; excludeIds?: string[]; limit?: number; tieBreakSeed?: string };
    if (!b.mood || !b.scene) return reply.code(400).send({ error: "mood and scene are required" });
    const candidates = retrieveCandidates(deps.tracks(), {
      mood: b.mood,
      scene: b.scene,
      excludeIds: b.excludeIds ? new Set(b.excludeIds) : undefined,
      limit: b.limit,
      tieBreakSeed: b.tieBreakSeed,
    });
    return { candidates };
  });

  // Step 2 planning: order candidates into an energy-arc tracklist.
  // mode: "provisional" (instant, LLM-free) | "full" (cached) | "replan" (mid-session)
  //       | "extend" (append fresh tracks, LLM-free rolling continuation).
  app.post("/plan_tracklist", async (req, reply) => {
    const b = (req.body ?? {}) as {
      mode?: "provisional" | "full" | "replan" | "extend";
      intent?: unknown;
      memories?: string;
      energyWeights?: Partial<Record<number, number>>;
      taste?: TastePreference[];
      replan?: { playedIds?: string[]; played?: TrackCandidate[]; lastPlayedEnergy?: number | null; remainingSlots?: number; avoidIds?: string[] };
      extend?: { playedIds?: string[]; appendSlots?: number; lastPlayedEnergy?: number | null };
      tieBreakSeed?: string;
      spotifyCandidates?: SpotifyTrackRef[];
      spotifyEnergyByUri?: Record<string, Energy>;
    };
    const intent = parseIntent(b.intent);
    if (!intent) return reply.code(400).send({ error: "intent.mood and intent.scene are required" });

    const mode = b.mode ?? "full";
    if (mode === "provisional") {
      const p = await createProvisionalPlan(deps, intent, b.memories ?? "", b.energyWeights, b.taste, b.tieBreakSeed, b.spotifyCandidates, b.spotifyEnergyByUri);
      return { result: p.result, violations: [], candidates: [...p.candidatesById.values()], spotifyMatchedEnergy: p.spotifyMatchedEnergy };
    }
    if (mode === "extend") {
      const e = b.extend ?? {};
      const p = await extendPlan(deps, {
        intent,
        playedIds: e.playedIds ?? [],
        appendSlots: e.appendSlots ?? 4,
        lastPlayedEnergy: e.lastPlayedEnergy ?? null,
        energyWeights: b.energyWeights,
        memories: b.memories ?? "",
        taste: b.taste,
        tieBreakSeed: b.tieBreakSeed,
      });
      return toPlanResponse(p);
    }
    if (mode === "replan") {
      const r = b.replan ?? {};
      const p = await replan(deps, {
        intent,
        playedIds: r.playedIds ?? [],
        played: r.played ?? [],
        lastPlayedEnergy: r.lastPlayedEnergy ?? null,
        remainingSlots: r.remainingSlots ?? 0,
        avoidIds: r.avoidIds,
        energyWeights: b.energyWeights,
        memories: b.memories ?? "",
        taste: b.taste,
        tieBreakSeed: b.tieBreakSeed,
      });
      return toPlanResponse(p);
    }
    return toPlanResponse(await createPlanCached(deps, intent, b.memories ?? "", b.energyWeights, b.taste, b.tieBreakSeed, b.spotifyCandidates, b.spotifyEnergyByUri));
  });
}
