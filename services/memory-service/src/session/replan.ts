import type { FlowTrackRef } from "@auracle/shared";
import type { EventsDb } from "../events-db.js";
import type { MemoryClient } from "../memory/client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import type { SessionState, SessionStore } from "./store.js";

/** Dependencies shared by the orchestration handlers (replan + tool dispatch). */
export interface OrchestrationDeps {
  store: SessionStore;
  events: EventsDb;
  memory: MemoryClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
}

export interface ReplanParams {
  mood: string;
  energy_delta?: "lighter" | "heavier" | "same";
}

export interface ReplanOutcome {
  replanned: boolean;
  remaining: FlowTrackRef[];
}

/**
 * Re-plan the not-yet-played slots for a new mood (the Live `mood_change` tool
 * calls this). The current track keeps playing; only the slots after it change.
 * Condition A leaves the playlist fixed (noop). Sources the new arc from
 * music-engine over HTTP (refactor-three-services).
 */
export async function applyReplan(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
): Promise<ReplanOutcome> {
  const remainingCount = state.tracklist.length - (state.currentTrackIndex + 1);
  if (state.condition === "A" || remainingCount <= 0) {
    return { replanned: false, remaining: deps.store.remaining(state) };
  }

  const seed = deps.store.currentEnergy(state);
  const lastPlayedEnergy = nudge(seed, params.energy_delta);
  const playedIds = state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id);
  const intent = { ...state.intent, mood: params.mood };
  const before = deps.store.remaining(state).map((r) => r.id);

  const { result, violations, candidates } = await deps.music.planTracklist({
    intent,
    mode: "replan",
    replan: { playedIds, played: [], lastPlayedEnergy, remainingSlots: remainingCount },
  });

  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  const appended = deps.store.replaceRemaining(state, result.tracklist, candidatesById);
  state.intent = intent; // future replans build on the new mood

  deps.events.recordEvent(state.id, "replan", {
    mood: params.mood,
    energy_delta: params.energy_delta ?? "same",
    before,
    after: appended.map((r) => r.id),
    violations,
  });

  // A successful mood shift is a cross-session preference signal — Condition C only.
  if (state.condition === "C") {
    await deps.memory.remember(
      `During a ${state.intent.scene} session the user shifted the mood to "${params.mood}" (${params.energy_delta ?? "same"} energy).`,
      state.id,
    );
  }

  return { replanned: true, remaining: appended };
}

/**
 * Background mood replan (Lane 3): run the slow Flow-LLM replan and, if the
 * tracklist changed, push `tracklist_updated` to the live session via the proxy.
 * Fire-and-forget from `mood_change` — the DJ already acked, so the conversation
 * never waits on this (see perf-first-start). A failure (replan or push) records
 * a `replan_failed` event rather than surfacing to the already-returned tool call.
 */
export async function replanAndPush(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
): Promise<void> {
  try {
    const outcome = await applyReplan(deps, state, params);
    if (!outcome.replanned) return;
    await deps.proxy.inject(state.id, {
      ui_events: [
        {
          type: "tracklist_updated",
          remaining: outcome.remaining,
          session_title: state.title,
          session_subtitle: state.subtitle,
        },
      ],
    });
  } catch (err) {
    deps.events.recordEvent(state.id, "replan_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Shift the glide seed by the requested energy delta, clamped to 1–5. */
export function nudge(energy: number | null, delta: ReplanParams["energy_delta"]): number | null {
  if (energy === null) return null;
  if (delta === "heavier") return Math.min(5, energy + 1);
  if (delta === "lighter") return Math.max(1, energy - 1);
  return energy;
}
