import type { FlowResult, FlowTrackRef, TrackCandidate } from "@auracle/shared";
import { energyTargetsForMood } from "@auracle/shared";
import { chooseNext } from "../selection/choose-next.js";
import { createSessionTitle } from "../session-title.js";
import type { FlowInput } from "./flow-model.js";

/** Deterministic Flow model: orders candidates along the mood energy arc. */
export class HeuristicFlowModel {
  async plan(input: FlowInput): Promise<FlowResult> {
    const targets = energyTargetsForMood(input.remainingSlots, input.intent.mood, input.lastPlayedEnergy);
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
        source: "local",
      });
      prev = pick;
    });

    const initial = input.lastPlayedEnergy === null;
    const arc: FlowResult["arc"] = initial ? "build" : "wind_down";
    return {
      session_title: createSessionTitle(input.intent, input.tieBreakSeed),
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
