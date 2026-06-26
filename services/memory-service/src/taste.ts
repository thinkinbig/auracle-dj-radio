import type {
  SaveTasteRequest,
  TasteEntityType,
  TastePolarity,
  TastePreference,
  TasteSource,
} from "@auracle/shared";
import type { CatalogIndex } from "./catalog-index.js";

const ENTITY_TYPES = new Set<TasteEntityType>(["genre", "artist", "album", "track"]);
const POLARITIES = new Set<TastePolarity>(["prefer", "avoid"]);
const SOURCES = new Set<TasteSource>(["onboarding", "search", "session"]);

/** Validate the wire shape of one preference (not catalog membership). */
function parsePreference(raw: unknown): TastePreference | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const entityType = p.entityType as TasteEntityType;
  const entityId = typeof p.entityId === "string" ? p.entityId.trim() : "";
  const polarity = p.polarity as TastePolarity;
  const source = p.source as TasteSource;
  if (!ENTITY_TYPES.has(entityType) || !entityId || !POLARITIES.has(polarity) || !SOURCES.has(source)) {
    return undefined;
  }
  const pref: TastePreference = { entityType, entityId, polarity, source };
  if (p.strength !== undefined) {
    if (p.strength !== 1 && p.strength !== 2 && p.strength !== 3) return undefined;
    pref.strength = p.strength;
  }
  return pref;
}

/**
 * Validate the PUT body shape. Returns the parsed request, or an error string
 * naming the first malformed field (caller maps to 400).
 */
export function parseSaveTasteRequest(raw: unknown): SaveTasteRequest | { error: string } {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.preferences)) return { error: "preferences must be an array" };
  if (body.freeText !== undefined && typeof body.freeText !== "string") {
    return { error: "freeText must be a string" };
  }
  const preferences: TastePreference[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < body.preferences.length; i++) {
    const pref = parsePreference(body.preferences[i]);
    if (!pref) return { error: `preferences[${i}] is malformed` };
    const key = `${pref.entityType}\0${pref.entityId}`;
    if (seen.has(key)) return { error: `preferences[${i}] duplicates an earlier preference` };
    seen.add(key);
    preferences.push(pref);
  }
  const freeText = typeof body.freeText === "string" ? body.freeText.trim() : undefined;
  return { preferences, ...(freeText ? { freeText } : {}) };
}

/** Preferences whose `entityId` does not resolve against the live catalog. */
export function findInvalidPreferences(prefs: TastePreference[], catalog: CatalogIndex): TastePreference[] {
  return prefs.filter((p) => catalog.resolve(p.entityType, p.entityId) === undefined);
}

/**
 * Annotate stored preferences with live-catalog resolution state (§6): `status`
 * active/orphaned and the current `resolvedId`. Orphaned rows are returned (so
 * the UI can surface and offer to remove them) but carry no `resolvedId`.
 */
export function resolvePreferences(prefs: TastePreference[], catalog: CatalogIndex): TastePreference[] {
  return prefs.map((p) => {
    const resolvedId = catalog.resolve(p.entityType, p.entityId);
    return {
      ...p,
      status: resolvedId === undefined ? ("orphaned" as const) : ("active" as const),
      ...(resolvedId !== undefined ? { resolvedId } : {}),
    };
  });
}

function labelList(prefs: TastePreference[], entityType: TasteEntityType, catalog: CatalogIndex): string[] {
  return prefs.filter((p) => p.entityType === entityType).map((p) => catalog.label(p.entityType, p.entityId));
}

function clause(prefs: TastePreference[], verb: string, catalog: CatalogIndex): string | undefined {
  if (prefs.length === 0) return undefined;
  const parts: string[] = [];
  for (const type of ["genre", "artist", "album", "track"] as TasteEntityType[]) {
    const names = labelList(prefs, type, catalog);
    if (names.length) parts.push(`${type}s ${names.join(", ")}`);
  }
  return parts.length ? `${verb} ${parts.join("; ")}` : undefined;
}

/**
 * Build a single human-readable taste fact for mem0 (DJ recall), naming entities
 * by their catalog display name rather than raw slug/id. Returns "" when there
 * is nothing worth remembering, so the caller can skip the write.
 */
export function summarizeTaste(prefs: TastePreference[], catalog: CatalogIndex, freeText?: string): string {
  const sentences = [
    clause(
      prefs.filter((p) => p.polarity === "prefer"),
      "Prefers",
      catalog,
    ),
    clause(
      prefs.filter((p) => p.polarity === "avoid"),
      "Avoids",
      catalog,
    ),
  ].filter((s): s is string => Boolean(s));
  if (freeText) sentences.push(`Note: ${freeText}`);
  return sentences.length ? `${sentences.join(". ")}.` : "";
}
