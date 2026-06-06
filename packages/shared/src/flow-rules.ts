import { MAX_ENERGY_JUMP, MAX_TEMPO_JUMP_BPM } from "./arc.js";
import type { TrackCandidate } from "./track.js";

/** Fields compared for adjacent-track hard rules (doc §硬性规则). */
export type AdjacentTrackFields = Pick<TrackCandidate, "tempo" | "energy" | "genre">;

/** True when prev → cur satisfies tempo, energy, and genre rules. */
export function isAdjacentStepLegal(prev: AdjacentTrackFields, cur: AdjacentTrackFields): boolean {
  return (
    Math.abs(cur.tempo - prev.tempo) <= MAX_TEMPO_JUMP_BPM &&
    Math.abs(cur.energy - prev.energy) <= MAX_ENERGY_JUMP &&
    cur.genre !== prev.genre
  );
}

/** Soft penalty for heuristic ordering — weights mirror validate severity. */
export function adjacentStepPenalty(prev: AdjacentTrackFields, cur: AdjacentTrackFields): number {
  let cost = 0;
  if (cur.genre === prev.genre) cost += 2;
  if (Math.abs(cur.tempo - prev.tempo) > MAX_TEMPO_JUMP_BPM) cost += 2;
  if (Math.abs(cur.energy - prev.energy) > MAX_ENERGY_JUMP) cost += 3;
  return cost;
}
