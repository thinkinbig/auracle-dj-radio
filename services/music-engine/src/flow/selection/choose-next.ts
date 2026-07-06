import type { TrackCandidate } from "@auracle/shared";
import { adjacentStepPenalty, isAdjacentStepLegal, tieBreakValue } from "@auracle/shared";

/**
 * Pick the candidate closest to the target energy.
 * Cost = energy distance + adjacency penalties; when legal steps exist, only those are considered.
 * Equal-cost candidates are broken by tieBreakSeed (not array position) so injected
 * pools (e.g. Spotify seeds, always appended after local candidates) get a fair shot
 * instead of always losing ties to whichever pool was concatenated first.
 */
export function chooseNext(
  pool: TrackCandidate[],
  target: number,
  prev: TrackCandidate | undefined,
  tieBreakSeed?: string,
): TrackCandidate | undefined {
  const legal = prev ? pool.filter((c) => isAdjacentStepLegal(prev, c)) : pool;
  const search = legal.length > 0 ? legal : pool;

  let best: TrackCandidate | undefined;
  let bestCost = Infinity;
  for (const c of search) {
    let cost = Math.abs(c.energy - target);
    if (prev && !isAdjacentStepLegal(prev, c)) cost += adjacentStepPenalty(prev, c);
    const winsTie = cost === bestCost && best !== undefined && tieBreakSeed !== undefined
      && tieBreakValue(tieBreakSeed, c.id) < tieBreakValue(tieBreakSeed, best.id);
    if (cost < bestCost || winsTie) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}
