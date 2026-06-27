import type { FastifyInstance } from "fastify";
import type { SessionIntent, TastePreference, TrackCandidate } from "@auracle/shared";
import { createPlanCached, createProvisionalPlan, replan, type PlanDeps, type PlanResult } from "../flow/plan.js";
import { retrieveCandidates } from "../flow/retrieval/retrieve.js";

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

/** Flatten a PlanResult for the wire: candidatesById Map -> TrackCandidate[]. */
function toPlanResponse(p: PlanResult): { result: PlanResult["result"]; violations: PlanResult["violations"]; candidates: TrackCandidate[] } {
  return { result: p.result, violations: p.violations, candidates: [...p.candidatesById.values()] };
}

export function registerPlanningRoutes(app: FastifyInstance, deps: PlanDeps): void {
  // Step 1 retrieval: embed mood/scene, return top-K candidates by cosine.
  app.post("/search_catalog", async (req, reply) => {
    const b = (req.body ?? {}) as { mood?: string; scene?: string; excludeIds?: string[]; limit?: number };
    if (!b.mood || !b.scene) return reply.code(400).send({ error: "mood and scene are required" });
    const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
      mood: b.mood,
      scene: b.scene,
      excludeIds: b.excludeIds ? new Set(b.excludeIds) : undefined,
      limit: b.limit,
    });
    return { candidates };
  });

  // Step 2 planning: order candidates into an energy-arc tracklist.
  // mode: "provisional" (instant, LLM-free) | "full" (cached) | "replan" (mid-session).
  app.post("/plan_tracklist", async (req, reply) => {
    const b = (req.body ?? {}) as {
      mode?: "provisional" | "full" | "replan";
      intent?: unknown;
      memories?: string;
      energyWeights?: Partial<Record<number, number>>;
      taste?: TastePreference[];
      replan?: { playedIds?: string[]; played?: TrackCandidate[]; lastPlayedEnergy?: number | null; remainingSlots?: number };
    };
    const intent = parseIntent(b.intent);
    if (!intent) return reply.code(400).send({ error: "intent.mood and intent.scene are required" });

    const mode = b.mode ?? "full";
    if (mode === "provisional") {
      const p = await createProvisionalPlan(deps, intent, b.energyWeights, b.taste);
      return { result: p.result, violations: [], candidates: [...p.candidatesById.values()] };
    }
    if (mode === "replan") {
      const r = b.replan ?? {};
      const p = await replan(deps, {
        intent,
        playedIds: r.playedIds ?? [],
        played: r.played ?? [],
        lastPlayedEnergy: r.lastPlayedEnergy ?? null,
        remainingSlots: r.remainingSlots ?? 0,
        energyWeights: b.energyWeights,
        memories: b.memories ?? "",
        taste: b.taste,
      });
      return toPlanResponse(p);
    }
    return toPlanResponse(await createPlanCached(deps, intent, b.memories ?? "", b.energyWeights, b.taste));
  });
}
