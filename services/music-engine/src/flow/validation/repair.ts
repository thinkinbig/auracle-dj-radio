import type { FlowResult, FlowTrackRef, TrackCandidate } from "@auracle/shared";
import { validateTracklist, fitsAdjacentSlot } from "./validate.js";

/**
 * Deterministic post-process: swap violating slots with unused candidates from
 * the pool. Used after violation-aware LLM retry still fails.
 */
export function repairTracklist(
  result: FlowResult,
  candidatesById: Map<string, TrackCandidate>,
  pool: TrackCandidate[],
): FlowResult {
  const ordered = [...result.tracklist].sort((a, b) => a.flow_position - b.flow_position);
  const used = () => new Set(ordered.map((r) => r.id));

  // Renumber non-contiguous positions first.
  ordered.forEach((ref, i) => {
    ref.flow_position = i + 1;
  });

  const maxPasses = pool.length * 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    const violations = validateTracklist(ordered, candidatesById);
    if (violations.length === 0) break;

    const structural = violations.find((v) => v.kind === "unknown_track");
    if (structural) {
      const idx = structural.position - 1;
      if (idx < 0 || idx >= ordered.length) break;
      const replacement = pool.find((c) => !used().has(c.id));
      if (!replacement) break;
      ordered[idx] = { ...ordered[idx]!, id: replacement.id };
      continue;
    }

    const step = violations.find(
      (v) => v.kind === "tempo_jump" || v.kind === "energy_jump" || v.kind === "genre_repeat",
    );
    if (!step) break;

    const idx = step.position - 1;
    if (idx < 0 || idx >= ordered.length) break;
    const prev = idx > 0 ? candidatesById.get(ordered[idx - 1]!.id) : undefined;
    const next = idx < ordered.length - 1 ? candidatesById.get(ordered[idx + 1]!.id) : undefined;
    const currentId = ordered[idx]!.id;

    const replacement = pool.find(
      (c) => c.id !== currentId && !used().has(c.id) && fitsAdjacentSlot(prev, c, next),
    );
    if (!replacement) break;

    ordered[idx] = { ...ordered[idx]!, id: replacement.id, reason: `repaired: ${replacement.genre}` };
  }

  return { ...result, tracklist: ordered };
}
