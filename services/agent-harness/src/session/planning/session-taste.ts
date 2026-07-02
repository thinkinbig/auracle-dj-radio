import type { TastePreference } from "@auracle/shared";
import type { SessionState } from "../state.js";

/**
 * Ephemeral, session-scoped taste from like/dislike feedback (#68).
 *
 * These prefs live only on `SessionState` and feed the replan/extend rank so
 * feedback is felt in-session under conditions B and C; the durable copy (C
 * only) is memory-service's job, threaded back on the next session's create.
 */

const prefKey = (p: TastePreference): string => `${p.entityType}\0${p.entityId}`;

/** Fold freshly derived feedback prefs into the session taste — last reaction wins per entity. */
export function mergeSessionTaste(state: SessionState, incoming: TastePreference[]): void {
  if (incoming.length === 0) return;
  const merged = new Map(state.sessionTaste.map((p) => [prefKey(p), p]));
  for (const pref of incoming) merged.set(prefKey(pref), pref);
  state.sessionTaste = [...merged.values()];
}

/**
 * Overlay this session's feedback prefs on the stored (cross-session) set for
 * plan weighting; the fresher in-session reaction wins per entity. Returns
 * undefined when there is no signal at all, matching the optional plan field.
 */
export function overlaySessionTaste(
  stored: TastePreference[] | undefined,
  sessionTaste: TastePreference[],
): TastePreference[] | undefined {
  if (sessionTaste.length === 0) return stored;
  const merged = new Map((stored ?? []).map((p) => [prefKey(p), p]));
  for (const pref of sessionTaste) merged.set(prefKey(pref), pref);
  return [...merged.values()];
}
