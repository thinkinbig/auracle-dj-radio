import type { FlowTrackRef, TrackCandidate } from "@auracle/shared";
import { MAX_ENERGY_JUMP, MAX_TEMPO_JUMP_BPM } from "@auracle/shared";

export type ViolationKind = "unknown_track" | "non_contiguous" | "tempo_jump" | "energy_jump" | "genre_repeat";

export interface Violation {
  kind: ViolationKind;
  position: number; // 1-based flow_position of the offending track
  detail: string;
}

/**
 * Post-validation of a Flow result against the hard ordering rules
 * (packages/shared flow-rules + arc constants).
 */
export function validateTracklist(refs: FlowTrackRef[], byId: Map<string, TrackCandidate>): Violation[] {
  const violations: Violation[] = [];
  const ordered = [...refs].sort((a, b) => a.flow_position - b.flow_position);

  ordered.forEach((ref, i) => {
    if (!byId.has(ref.id)) {
      violations.push({ kind: "unknown_track", position: ref.flow_position, detail: `id ${ref.id} not in candidate set` });
    }
    if (ref.flow_position !== i + 1) {
      violations.push({ kind: "non_contiguous", position: ref.flow_position, detail: `expected position ${i + 1}` });
    }
  });

  for (let i = 1; i < ordered.length; i++) {
    const prev = byId.get(ordered[i - 1]!.id);
    const cur = byId.get(ordered[i]!.id);
    if (!prev || !cur) continue;
    const pos = ordered[i]!.flow_position;
    if (Math.abs(cur.tempo - prev.tempo) > MAX_TEMPO_JUMP_BPM) {
      violations.push({
        kind: "tempo_jump",
        position: pos,
        detail: `${prev.tempo}→${cur.tempo} BPM > ${MAX_TEMPO_JUMP_BPM}`,
      });
    }
    if (Math.abs(cur.energy - prev.energy) > MAX_ENERGY_JUMP) {
      violations.push({
        kind: "energy_jump",
        position: pos,
        detail: `${prev.energy}→${cur.energy} > ${MAX_ENERGY_JUMP}`,
      });
    }
    if (cur.genre === prev.genre) {
      violations.push({ kind: "genre_repeat", position: pos, detail: `genre ${cur.genre} repeats` });
    }
  }

  return violations;
}
