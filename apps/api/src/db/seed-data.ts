import type { Track } from "@auracle/shared";
import { loadCatalogManifest, manifestToTracks } from "../catalog/manifest.js";

/**
 * Tracks loaded from `apps/api/data/catalog/manifest.json`.
 * Replaces the hand-maintained seed list — single source of truth (ADR-0003).
 */
export function loadSeedTracks(): Track[] {
  return manifestToTracks(loadCatalogManifest());
}

/** @deprecated Use loadSeedTracks() — kept for tests importing SEED_TRACKS. */
export const SEED_TRACKS: Track[] = loadSeedTracks();
