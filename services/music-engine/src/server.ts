import Fastify, { type FastifyInstance } from "fastify";
import type { GenreCount, SessionIntent, TrackCandidate } from "@auracle/shared";
import { CatalogDb } from "./catalog-db.js";
import { computeCatalogRevision, loadGenreTaxonomy } from "./catalog/manifest.js";
import { buildEmbedder, buildFlowModel } from "./wiring.js";
import { retrieveCandidates } from "./flow/retrieve.js";
import {
  createPlanCached,
  createProvisionalPlan,
  replan,
  type PlanDeps,
  type PlanResult,
} from "./flow/plan.js";

export interface MusicEngine {
  app: FastifyInstance;
  db: CatalogDb;
}

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

/** Flatten a PlanResult for the wire: candidatesById Map → TrackCandidate[]. */
function toPlanResponse(p: PlanResult): { result: PlanResult["result"]; violations: PlanResult["violations"]; candidates: TrackCandidate[] } {
  return { result: p.result, violations: p.violations, candidates: [...p.candidatesById.values()] };
}

/**
 * Build the music-engine HTTP service: stateless catalog retrieval + tracklist
 * planning over an owned catalog DB. Consumed by memory-service (refactor-three-services).
 */
export function buildServer(dbPath: string): MusicEngine {
  const db = new CatalogDb(dbPath);
  const deps: PlanDeps = {
    embedder: buildEmbedder(),
    flowModel: buildFlowModel(),
    tracks: () => db.allTracks(),
  };

  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, tracks: db.allTracks().length }));

  // Taxonomy slugs + per-genre track counts for the taste-onboarding UI (S3).
  app.get("/catalog/genres", async () => {
    const taxonomy = loadGenreTaxonomy();
    const counts = new Map<string, number>();
    for (const t of db.allTracks()) counts.set(t.genreSlug, (counts.get(t.genreSlug) ?? 0) + 1);
    const genres: GenreCount[] = taxonomy.genres.map((g) => ({ ...g, count: counts.get(g.slug) ?? 0 }));
    return { genres, revision: computeCatalogRevision() };
  });

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
      replan?: { playedIds?: string[]; played?: TrackCandidate[]; lastPlayedEnergy?: number | null; remainingSlots?: number };
    };
    const intent = parseIntent(b.intent);
    if (!intent) return reply.code(400).send({ error: "intent.mood and intent.scene are required" });

    const mode = b.mode ?? "full";
    if (mode === "provisional") {
      const p = await createProvisionalPlan(deps, intent, b.energyWeights);
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
      });
      return toPlanResponse(p);
    }
    return toPlanResponse(await createPlanCached(deps, intent, b.memories ?? "", b.energyWeights));
  });

  // Catalog metadata for cue building (memory-service prefetches per session).
  app.get("/tracks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const meta = db.getTrackMeta(id);
    if (!meta) return reply.code(404).send({ error: "track not found" });
    return meta;
  });

  return { app, db };
}
