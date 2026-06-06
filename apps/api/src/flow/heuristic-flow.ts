import type { FlowResult, FlowTrackRef, TrackCandidate } from "@auracle/shared";
import { ARC_BANDS, MAX_ENERGY_JUMP, MAX_TEMPO_JUMP_BPM } from "@auracle/shared";
import type { FlowModel, FlowInput } from "./flow-model.js";

/**
 * Deterministic, LLM-free Flow model. Orders candidates along the energy arc
 * so the server runs offline and so plan/validate logic is unit-testable.
 * The real Gemini Flash model replaces it when a key is configured.
 */
export class HeuristicFlowModel implements FlowModel {
  async plan(input: FlowInput): Promise<FlowResult> {
    const targets = energyTargets(input.remainingSlots, input.lastPlayedEnergy);
    const pool = [...input.candidates];
    const tracklist: FlowTrackRef[] = [];
    let prev: TrackCandidate | undefined;

    targets.forEach((target, i) => {
      const pick = chooseNext(pool, target, prev);
      if (!pick) return;
      pool.splice(pool.indexOf(pick), 1);
      tracklist.push({
        id: pick.id,
        flow_position: i + 1,
        reason: `energy ${pick.energy} fits arc target ${target} (${pick.genre})`,
      });
      prev = pick;
    });

    const initial = input.lastPlayedEnergy === null;
    const arc: FlowResult["arc"] = initial ? "build" : "wind_down";
    const vol = seriesVolume(input.intent);
    const showName = titleCase(`${input.intent.mood} ${input.intent.scene}`);
    return {
      session_title: `${showName}, vol. ${vol}`,
      session_subtitle: `${input.intent.duration_min} min · ${arcLabel(arc)}`,
      arc,
      tracklist,
    };
  }
}

const ARC_LABELS: Record<FlowResult["arc"], string> = {
  warm_up: "warming up",
  build: "building",
  peak: "peak energy",
  wind_down: "winds down",
};

function arcLabel(arc: FlowResult["arc"]): string {
  return ARC_LABELS[arc];
}

/** Stable 1–9 volume number per session intent (demo heuristic for "vol. N"). */
function seriesVolume(intent: FlowInput["intent"]): number {
  const key = `${intent.mood}:${intent.scene}:${intent.duration_min}`;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 997;
  return (h % 9) + 1;
}

/** Per-slot target energy: full arc from ARC_BANDS, replan = glide to wind-down (2). */
function energyTargets(slots: number, lastPlayedEnergy: number | null): number[] {
  if (lastPlayedEnergy === null) {
    return Array.from({ length: slots }, (_, i) => {
      const band = ARC_BANDS[i + 1];
      return band ? Math.round((band.min + band.max) / 2) : 3;
    });
  }
  // Smooth glide from last played energy down to the wind-down floor (2).
  const floor = 2;
  return Array.from({ length: slots }, (_, i) =>
    Math.round(lastPlayedEnergy + ((floor - lastPlayedEnergy) * (i + 1)) / slots),
  );
}

/** Pick the candidate closest to the target energy, preferring legal tempo/genre steps. */
function chooseNext(pool: TrackCandidate[], target: number, prev: TrackCandidate | undefined): TrackCandidate | undefined {
  let best: TrackCandidate | undefined;
  let bestCost = Infinity;
  for (const c of pool) {
    let cost = Math.abs(c.energy - target);
    if (prev) {
      if (c.genre === prev.genre) cost += 2;
      if (Math.abs(c.tempo - prev.tempo) > MAX_TEMPO_JUMP_BPM) cost += 2;
      if (Math.abs(c.energy - prev.energy) > MAX_ENERGY_JUMP) cost += 3;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}
