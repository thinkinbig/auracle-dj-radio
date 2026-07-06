import { MAX_ENERGY_JUMP, MAX_TEMPO_JUMP_BPM } from "./arc.js";
import type { TrackCandidate } from "./track.js";

/** Fields compared for adjacent-track hard rules (doc §硬性规则). */
export type AdjacentTrackFields = Pick<TrackCandidate, "tempo" | "energy" | "genre">;

/** Externally-seeded tracks (Spotify) carry no known tempo/genre and are stamped 0/"" (plan.ts) — don't judge a rule neither side has data for. */
function tempoJumpsTooFar(prev: AdjacentTrackFields, cur: AdjacentTrackFields): boolean {
  if (prev.tempo <= 0 || cur.tempo <= 0) return false;
  return Math.abs(cur.tempo - prev.tempo) > MAX_TEMPO_JUMP_BPM;
}

function genreRepeats(prev: AdjacentTrackFields, cur: AdjacentTrackFields): boolean {
  if (!prev.genre || !cur.genre) return false;
  return cur.genre === prev.genre;
}

/** True when prev → cur satisfies tempo, energy, and genre rules. */
export function isAdjacentStepLegal(prev: AdjacentTrackFields, cur: AdjacentTrackFields): boolean {
  return (
    !tempoJumpsTooFar(prev, cur) &&
    Math.abs(cur.energy - prev.energy) <= MAX_ENERGY_JUMP &&
    !genreRepeats(prev, cur)
  );
}

/** Soft penalty for heuristic ordering — weights mirror validate severity. */
export function adjacentStepPenalty(prev: AdjacentTrackFields, cur: AdjacentTrackFields): number {
  let cost = 0;
  if (genreRepeats(prev, cur)) cost += 2;
  if (tempoJumpsTooFar(prev, cur)) cost += 2;
  if (Math.abs(cur.energy - prev.energy) > MAX_ENERGY_JUMP) cost += 3;
  return cost;
}

/** Deterministic per-session pseudo-random ordering value for id, so equal-cost candidates don't always resolve by array position (e.g. local always beating injected Spotify seeds). */
export function tieBreakValue(seed: string, id: string): number {
  let hash = 0x811c9dc5;
  const input = seed + ":" + id;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
