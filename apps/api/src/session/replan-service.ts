import type { FlowTrackRef } from "@auracle/shared";
import type { ApiContext } from "../context.js";
import type { SessionState } from "./store.js";
import { replan } from "../flow/plan.js";

export interface ReplanParams {
  mood: string;
  energy_delta?: "lighter" | "heavier" | "same";
}

export interface ReplanOutcome {
  replanned: boolean;
  remaining: FlowTrackRef[];
}

/**
 * Re-plan the not-yet-played slots for a new mood (Live `mood_change` tool and
 * the demo REST endpoint both call this). The current track keeps playing;
 * only the slots after it change. Condition A leaves the playlist fixed (noop).
 */
export async function applyReplan(
  ctx: ApiContext,
  state: SessionState,
  params: ReplanParams,
): Promise<ReplanOutcome> {
  const remainingCount = state.tracklist.length - (state.currentTrackIndex + 1);
  if (state.condition === "A" || remainingCount <= 0) {
    return { replanned: false, remaining: ctx.store.remaining(state) };
  }

  const seed = ctx.store.currentEnergy(state);
  const lastPlayedEnergy = nudge(seed, params.energy_delta);
  const playedIds = state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id);
  const intent = { ...state.intent, mood: params.mood };
  const before = ctx.store.remaining(state).map((r) => r.id);

  const { result, violations, candidatesById } = await replan(ctx.planDeps, {
    intent,
    playedIds,
    played: [],
    lastPlayedEnergy,
    remainingSlots: remainingCount,
  });

  const appended = ctx.store.replaceRemaining(state, result.tracklist, candidatesById);
  state.intent = intent; // future replans build on the new mood

  ctx.db.recordEvent(state.id, "replan", {
    mood: params.mood,
    energy_delta: params.energy_delta ?? "same",
    before,
    after: appended.map((r) => r.id),
    violations,
  });

  // A successful mood shift is a cross-session preference signal — Condition C only.
  if (state.condition === "C") {
    await ctx.memory.remember(
      `During a ${state.intent.scene} session the user shifted the mood to "${params.mood}" (${params.energy_delta ?? "same"} energy).`,
      state.id,
    );
  }

  return { replanned: true, remaining: appended };
}

/** Shift the glide seed by the requested energy delta, clamped to 1–5. */
function nudge(energy: number | null, delta: ReplanParams["energy_delta"]): number | null {
  if (energy === null) return null;
  if (delta === "heavier") return Math.min(5, energy + 1);
  if (delta === "lighter") return Math.max(1, energy - 1);
  return energy;
}
