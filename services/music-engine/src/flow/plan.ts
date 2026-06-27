import type { FlowResult, FlowTrackRef, SessionIntent, TastePreference, TrackCandidate } from "@auracle/shared";
import { FULL_SESSION_LENGTH, energyTargetsForMood } from "@auracle/shared";
import type { TrackRow } from "../catalog-db.js";
import { HeuristicFlowModel } from "./llm/heuristic-flow.js";
import type { FlowInput } from "./llm/flow-model.js";
import { energyWeightsFromMemories, mergeEnergyWeights } from "./weighting/memory-energy.js";
import { retrieveCandidates } from "./retrieval/retrieve.js";
import { tasteCacheKey } from "./weighting/taste-weighting.js";
import { validateTracklist, type Violation } from "./validation/validate.js";
import { chooseNext } from "./selection/choose-next.js";

export interface PlanDeps {
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
  const candidates = retrieveCandidates(deps.tracks(), {
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
      tracklist: buildProvisionalArc(candidates, intent.mood),
    },
    candidatesById,
  };
}

/** Fill starter slots by closest candidate energy to the mood-dependent arc targets. */
function buildProvisionalArc(candidates: TrackCandidate[], mood: string): FlowTrackRef[] {
  const pool = [...candidates];
  const slots: FlowTrackRef[] = [];
  const targets = energyTargetsForMood(FULL_SESSION_LENGTH, mood, null);
  let prev: TrackCandidate | undefined;

  targets.forEach((target, i) => {
    const pick = chooseNext(pool, target, prev);
    if (!pick) return;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: i + 1, reason: "mood arc target " + target.toFixed(1) + " (provisional)" });
    prev = pick;
  });

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
  const candidates = retrieveCandidates(deps.tracks(), {
    mood: intent.mood,
    scene: intent.scene,
    limit: 24,
    energyWeights: effectiveEnergyWeights,
    taste,
  });
  return runHeuristicFlow({
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
  const candidates = retrieveCandidates(deps.tracks(), {
    mood: input.intent.mood,
    scene: input.intent.scene,
    excludeIds: new Set(input.playedIds),
    limit: Math.max(24, input.remainingSlots * 3),
    energyWeights: effectiveEnergyWeights,
    taste: input.taste,
  });
  return runHeuristicFlow({
    intent: input.intent,
    memories: input.memories ?? "",
    played: input.played,
    lastPlayedEnergy: input.lastPlayedEnergy,
    remainingSlots: input.remainingSlots,
    candidates,
  });
}

export interface ExtendInput {
  intent: SessionIntent;
  /** Already-played + currently-queued ids to exclude from the append pool. */
  playedIds: string[];
  /** How many fresh tracks to append (default 4). */
  appendSlots: number;
  /** Energy of the last queued track, to chain the continuation smoothly. */
  lastPlayedEnergy: number | null;
  energyWeights?: Partial<Record<number, number>>;
  /** Cross-session preference recall (condition C); "" for A/B. */
  memories?: string;
  /** Structured taste prefer/avoid (condition C); undefined for A/B. */
  taste?: TastePreference[];
}

/**
 * Rolling extend (E1): deterministically append `appendSlots` fresh tracks so the
 * station stays on air past the initial arc. Retrieval excludes everything already
 * played/queued; ordering chains from the last queued energy via chooseNext. No Flow
 * LLM — extend is a fast background continuation, not a re-plan.
 */
export async function extendPlan(deps: PlanDeps, input: ExtendInput): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(input.energyWeights, energyWeightsFromMemories(input.memories ?? ""));
  const candidates = retrieveCandidates(deps.tracks(), {
    mood: input.intent.mood,
    scene: input.intent.scene,
    excludeIds: new Set(input.playedIds),
    limit: Math.max(24, input.appendSlots * 3),
    energyWeights: effectiveEnergyWeights,
    taste: input.taste,
  });
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  const tracklist = buildExtendChain(candidates, input.appendSlots, input.lastPlayedEnergy);
  return {
    result: { session_title: "", session_subtitle: "", arc: "peak", tracklist },
    violations: [],
    candidatesById,
  };
}

/** Greedy energy chain of up to `count` candidates, starting near `seedEnergy`. */
function buildExtendChain(candidates: TrackCandidate[], count: number, seedEnergy: number | null): FlowTrackRef[] {
  const pool = [...candidates];
  const slots: FlowTrackRef[] = [];
  let prev: TrackCandidate | undefined;

  for (let pos = 1; pos <= count && pool.length > 0; pos++) {
    const target = prev?.energy ?? seedEnergy ?? pool[0]!.energy;
    const pick = chooseNext(pool, target, prev);
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: pos, reason: "rolling extend" });
    prev = pick;
  }
  return slots;
}

/** Step 2 deterministic flow plan + safety-net validation (ADR-0001: no LLM retry/repair loop). */
async function runHeuristicFlow(input: FlowInput): Promise<PlanResult> {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const result = await new HeuristicFlowModel().plan(input);
  const violations = validateTracklist(result.tracklist, candidatesById);
  return { result, violations, candidatesById };
}
