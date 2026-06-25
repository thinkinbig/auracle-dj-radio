import type { SaveTasteRequest, TasteEntityType, TastePolarity, TastePreference, TasteSource } from '@auracle/shared';

/**
 * Pure selection model for the taste editor (Epic #3, S3). Keeps the editable
 * state as a keyed map of preferences so the UI stays declarative and the logic
 * stays unit-testable (web tests run in a node env, no DOM).
 */
export type Selection = Record<string, TastePreference>;

/** Track pin/block caps from the S3 spec (#6): up to ~5 pins, ~3 blocks. */
export const MAX_TRACK_PREFER = 5;
export const MAX_TRACK_AVOID = 3;

export function selectionKey(entityType: TasteEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** Build editor state from a GET /users/me/taste response (keeps `status`/`resolvedId`). */
export function hydrateSelection(prefs: TastePreference[]): Selection {
  const selection: Selection = {};
  for (const pref of prefs) selection[selectionKey(pref.entityType, pref.entityId)] = pref;
  return selection;
}

export function polarityOf(
  selection: Selection,
  entityType: TasteEntityType,
  entityId: string,
): TastePolarity | undefined {
  return selection[selectionKey(entityType, entityId)]?.polarity;
}

/** Whether an entity is orphaned (resolved against the catalog as missing). */
export function isOrphaned(selection: Selection, entityType: TasteEntityType, entityId: string): boolean {
  return selection[selectionKey(entityType, entityId)]?.status === 'orphaned';
}

/**
 * Set (or clear, with `polarity === null`) the polarity of one entity. Returns a
 * new Selection; the existing `source` is preserved so an onboarding pick edited
 * later keeps its provenance.
 */
export function setPolarity(
  selection: Selection,
  entityType: TasteEntityType,
  entityId: string,
  polarity: TastePolarity | null,
  source: TasteSource = 'onboarding',
): Selection {
  const key = selectionKey(entityType, entityId);
  const next = { ...selection };
  if (polarity === null) {
    delete next[key];
    return next;
  }
  next[key] = { entityType, entityId, polarity, source: next[key]?.source ?? source };
  return next;
}

/** Toggle a polarity: clicking the active polarity clears it (tri-state chips). */
export function togglePolarity(
  selection: Selection,
  entityType: TasteEntityType,
  entityId: string,
  polarity: TastePolarity,
  source: TasteSource = 'onboarding',
): Selection {
  const current = polarityOf(selection, entityType, entityId);
  return setPolarity(selection, entityType, entityId, current === polarity ? null : polarity, source);
}

export function countByType(selection: Selection, entityType: TasteEntityType, polarity: TastePolarity): number {
  return Object.values(selection).filter((p) => p.entityType === entityType && p.polarity === polarity).length;
}

/**
 * Whether a track polarity can still be set, given the pin/block caps. Always
 * true when clearing or when the track already holds that polarity (toggling off).
 */
export function canSetTrack(selection: Selection, trackId: string, polarity: TastePolarity): boolean {
  if (polarityOf(selection, 'track', trackId) === polarity) return true; // toggling off
  const cap = polarity === 'prefer' ? MAX_TRACK_PREFER : MAX_TRACK_AVOID;
  return countByType(selection, 'track', polarity) < cap;
}

/** Orphaned entries surfaced for the "remove" affordance (greyed in the UI). */
export function orphanedEntries(selection: Selection): TastePreference[] {
  return Object.values(selection).filter((p) => p.status === 'orphaned');
}

/**
 * Build the PUT payload. Orphaned entries are dropped — they no longer resolve
 * against the live catalog, so re-sending them would 400 (and saving is exactly
 * how the user prunes them).
 */
export function toSaveRequest(selection: Selection, freeText: string): SaveTasteRequest {
  const preferences = Object.values(selection)
    .filter((p) => p.status !== 'orphaned')
    .map(({ entityType, entityId, polarity, source, strength }) => ({
      entityType,
      entityId,
      polarity,
      source,
      ...(strength ? { strength } : {}),
    }));
  const trimmed = freeText.trim();
  return { preferences, ...(trimmed ? { freeText: trimmed } : {}) };
}
