import type { FlowResult, FlowTrackRef, SessionIntent, TastePreference, TrackCandidate } from "@auracle/shared";
import { ARC_BANDS, FULL_SESSION_LENGTH } from "@auracle/shared";
import type { TrackRow } from "../catalog-db.js";
import type { Embedder } from "./embedder.js";
import type { FlowModel, FlowInput } from "./flow-model.js";
import { energyWeightsFromMemories, mergeEnergyWeights } from "./memory-energy.js";
import { repairTracklist } from "./repair.js";
import { retrieveCandidates } from "./retrieve.js";
import { tasteCacheKey } from "./taste-weighting.js";
import { formatViolationsForRetry, validateTracklist, type Violation } from "./validate.js";

export interface PlanDeps {
  embedder: Embedder;
  flowModel: FlowModel;
  /** Returns the full track library (read from SQLite at call time). */
  tracks: () => TrackRow[];
}

export interface PlanResult {
  result: FlowResult;
  violations: Violation[];
  candidatesById: Map<string, TrackCandidate>;
}

/**
 * Cache of clean initial plans keyed on the inputs that determine them.
 * Condition isn't part of the key — it only changes `memories` (C passes mem0
 * recall, A/B pass ""), so the memories string already captures it. Including
 * memories means a new recorded preference (which changes recall) busts the
 * cache, preserving Condition C fidelity.
 */
const planCache = new Map<string, PlanResult>();

function planKey(
  intent: SessionIntent,
  memories: string,
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): string {
  const w = energyWeights && Object.keys(energyWeights).length > 0
    ? Object.entries(energyWeights).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}:${(v ?? 0).toFixed(2)}`).join(",")
    : "";
  return [intent.mood, intent.scene, intent.duration_min, memories, w, tasteCacheKey(taste)].join(" ");
}

/** Defensive copy so a cached plan can't be mutated by replan/store aliasing. */
function clonePlan(p: PlanResult): PlanResult {
  return {
    result: { ...p.result, tracklist: p.result.tracklist.map((t) => ({ ...t })) },
    violations: [...p.violations],
    candidatesById: new Map(p.candidatesById),
  };
}

/** createPlan with an in-process cache so repeat sessions with identical inputs are instant. */
export async function createPlanCached(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): Promise<PlanResult> {
  const key = planKey(intent, memories, energyWeights, taste);
  const hit = planCache.get(key);
  if (hit) return clonePlan(hit);

  const plan = await createPlan(deps, intent, memories, energyWeights, taste);
  if (plan.violations.length === 0) planCache.set(key, plan); // don't cache imperfect plans
  return clonePlan(plan);
}

/** Cached plan for these inputs without computing one — lets the route skip the provisional path on a hit. */
export function peekPlanCache(
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): PlanResult | undefined {
  const hit = planCache.get(planKey(intent, memories, energyWeights, taste));
  return hit ? clonePlan(hit) : undefined;
}

/**
 * Fast, LLM-free starter plan: retrieval + a deterministic energy-arc ordering.
 * Lets playback begin immediately while the real Flow refines tracks 2..N in the
 * background. Also the graceful fallback if that refine fails.
 */
export async function createProvisionalPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): Promise<{ result: FlowResult; candidatesById: Map<string, TrackCandidate> }> {
  const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
    mood: intent.mood,
    scene: intent.scene,
    limit: 24,
    energyWeights,
    taste,
  });
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  return {
    result: {
      session_title: provisionalTitle(intent),
      session_subtitle: `${intent.duration_min} min`,
      arc: "warm_up",
      tracklist: buildProvisionalArc(candidates),
    },
    candidatesById,
  };
}

/** Track 1 = lowest-energy top candidate (arc warm-up); slots 2..N fill by closest energy to each arc band. */
function buildProvisionalArc(candidates: TrackCandidate[]): FlowTrackRef[] {
  if (candidates.length === 0) return [];
  // candidates are score-sorted desc, so the strict-less reduce keeps the best-scored among the lowest energy.
  const first = candidates.reduce((a, b) => (b.energy < a.energy ? b : a));
  const used = new Set([first.id]);
  const slots: FlowTrackRef[] = [{ id: first.id, flow_position: 1, reason: "warm-up opener (provisional)" }];
  for (let pos = 2; pos <= FULL_SESSION_LENGTH; pos++) {
    const band = ARC_BANDS[pos]!;
    const target = (band.min + band.max) / 2;
    let best: TrackCandidate | undefined;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const dist = Math.abs(c.energy - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (!best) break;
    used.add(best.id);
    slots.push({ id: best.id, flow_position: pos, reason: `${band.stage} (provisional)` });
  }
  return slots;
}

function provisionalTitle(intent: SessionIntent): string {
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return `${cap(intent.mood)} · ${cap(intent.scene)}`;
}

/** Initial session plan: Step 1 retrieval → Step 2 Flow over a fresh 8-track arc. */
export async function createPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(energyWeights, energyWeightsFromMemories(memories));
  const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
    mood: intent.mood,
    scene: intent.scene,
    limit: 24,
    energyWeights: effectiveEnergyWeights,
    taste,
  });
  return runFlow(deps.flowModel, {
    intent,
    memories,
    played: [],
    lastPlayedEnergy: null,
    remainingSlots: FULL_SESSION_LENGTH,
    candidates,
  });
}

export interface ReplanInput {
  intent: SessionIntent;
  playedIds: string[];
  played: TrackCandidate[];
  lastPlayedEnergy: number | null;
  remainingSlots: number;
  energyWeights?: Partial<Record<number, number>>;
  /** Cross-session preference recall (condition C); "" for A/B. */
  memories?: string;
  /** Structured taste prefer/avoid (condition C); undefined for A/B. */
  taste?: TastePreference[];
}

/** Mid-session replan: re-fill only the remaining slots, excluding played tracks. */
export async function replan(deps: PlanDeps, input: ReplanInput): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(input.energyWeights, energyWeightsFromMemories(input.memories ?? ""));
  const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
    mood: input.intent.mood,
    scene: input.intent.scene,
    excludeIds: new Set(input.playedIds),
    limit: Math.max(24, input.remainingSlots * 3),
    energyWeights: effectiveEnergyWeights,
    taste: input.taste,
  });
  return runFlow(deps.flowModel, {
    intent: input.intent,
    memories: input.memories ?? "",
    played: input.played,
    lastPlayedEnergy: input.lastPlayedEnergy,
    remainingSlots: input.remainingSlots,
    candidates,
  });
}

/**
 * Flow → validate → violation-aware retry → deterministic repair.
 * Retry passes violations back into the model; repair swaps bad slots locally.
 */
async function runFlow(flowModel: FlowModel, input: FlowInput): Promise<PlanResult> {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));

  let result = await flowModel.plan(input);
  let violations = validateTracklist(result.tracklist, candidatesById);

  if (violations.length > 0) {
    result = await flowModel.plan({
      ...input,
      repairHint: formatViolationsForRetry(violations),
    });
    violations = validateTracklist(result.tracklist, candidatesById);
  }

  if (violations.length > 0) {
    result = repairTracklist(result, candidatesById, input.candidates);
    violations = validateTracklist(result.tracklist, candidatesById);
  }

  return { result, violations, candidatesById };
}
