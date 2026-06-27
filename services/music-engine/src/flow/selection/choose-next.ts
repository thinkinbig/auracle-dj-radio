import type { TrackCandidate } from "@auracle/shared";
import { adjacentStepPenalty, isAdjacentStepLegal } from "@auracle/shared";

/**
 * Pick the candidate closest to the target energy.
 * Cost = energy distance + adjacency penalties; when legal steps exist, only those are considered.
 */
export function chooseNext(
  pool: TrackCandidate[],
  target: number,
  prev: TrackCandidate | undefined,
): TrackCandidate | undefined {
  const legal = prev ? pool.filter((c) => isAdjacentStepLegal(prev, c)) : pool;
  const search = legal.length > 0 ? legal : pool;

  let best: TrackCandidate | undefined;
  let bestCost = Infinity;
  for (const c of search) {
    let cost = Math.abs(c.energy - target);
    if (prev && !isAdjacentStepLegal(prev, c)) cost += adjacentStepPenalty(prev, c);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}
