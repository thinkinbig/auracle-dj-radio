import type { ReplanScope } from "./replan.js";

/**
 * Above this normalized edit-distance ratio, a new mood label counts as a
 * "significant" change (vs a synonym/inflection) and escalates nudge → steer.
 * Rule-based per design §7 HITL decision (no LLM classifier).
 */
export const STEER_DISTANCE_RATIO = 0.5;

/** Levenshtein distance between two short strings (iterative two-row DP). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/** Lowercase, trim, collapse internal whitespace — for mood-label comparison. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Route a `mood_change` to an on-air adjustment scope (design §2.2/§7) using
 * deterministic rules — no LLM:
 * - an energy-only tweak (`lighter`/`heavier`) is always a **nudge**, never a steer;
 * - an unchanged / synonymous / lightly-inflected mood stays a **nudge**;
 * - a significantly different mood label escalates to **steer** (re-fill the latter
 *   half of the queue).
 * `full` is never auto-routed here — it is reserved for the explicit Regenerate path.
 */
export function routeMoodScope(
  currentMood: string,
  newMood: string,
  energyDelta: "lighter" | "heavier" | "same" | undefined,
): ReplanScope {
  if (energyDelta === "lighter" || energyDelta === "heavier") return "nudge";
  const a = normalize(currentMood);
  const b = normalize(newMood);
  if (!b || a === b || a.includes(b) || b.includes(a)) return "nudge";
  const ratio = editDistance(a, b) / Math.max(a.length, b.length, 1);
  return ratio >= STEER_DISTANCE_RATIO ? "steer" : "nudge";
}
