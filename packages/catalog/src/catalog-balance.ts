import type { CatalogManifest, TastePreference } from "@auracle/shared";
import { createMoodEnergyProfile } from "@auracle/shared";
import { loadGenreTaxonomy, manifestToTracks } from "./manifest.js";

/** Mirrors `services/music-engine/src/flow/retrieval/retrieve.ts` for offline catalog QA. */
const TASTE_WEIGHT = 0.25;
const SKIP_PENALTY_WEIGHT = 0.3;

const SCENES = ["study", "focus", "chill", "commute", "gym", "party"] as const;
const ENERGIES = [1, 2, 3, 4, 5] as const;

export type Scene = (typeof SCENES)[number];

export interface BalanceTrack {
  id: string;
  energy: number;
  scene: string;
  genreSlug: string;
  artistSlug: string;
  albumSlug: string;
}

export interface BalanceCheck {
  id: string;
  level: "pass" | "warn" | "fail";
  message: string;
  detail?: unknown;
}

export interface BalanceReport {
  trackCount: number;
  goal: number;
  checks: BalanceCheck[];
  passed: number;
  warned: number;
  failed: number;
}

export interface BalanceOptions {
  /** Expansion target (default 100). Thresholds scale with `trackCount / goal`. */
  goal?: number;
  /** Energy-penalty ceiling for “in mood envelope” (matches soft retrieval). */
  envelopePenaltyMax?: number;
}

function tasteContribution(pref: TastePreference): number {
  const strength = Math.min(3, Math.max(1, pref.strength ?? 2)) / 3;
  const byType = { track: 1, album: 0.7, artist: 0.5, genre: 0.3 } as const;
  const polarity = pref.polarity === "prefer" ? 1 : -1;
  return polarity * byType[pref.entityType] * strength;
}

function buildTasteScore(prefs: TastePreference[], track: BalanceTrack): number {
  let sum = 0;
  for (const pref of prefs) {
    const match =
      (pref.entityType === "track" && pref.entityId === track.id) ||
      (pref.entityType === "album" && pref.entityId === track.albumSlug) ||
      (pref.entityType === "artist" && pref.entityId === track.artistSlug) ||
      (pref.entityType === "genre" && pref.entityId === track.genreSlug);
    if (match) sum += tasteContribution(pref);
  }
  return Math.min(1, Math.max(-1, sum));
}

function preferredGenres(prefs: TastePreference[]): Set<string> {
  const set = new Set<string>();
  for (const p of prefs) {
    if (p.entityType === "genre" && p.polarity === "prefer") set.add(p.entityId);
  }
  return set;
}

export function scoreTrack(
  track: BalanceTrack,
  mood: string,
  scene: string,
  taste?: TastePreference[],
  energyWeights?: Partial<Record<number, number>>,
): number {
  const profile = createMoodEnergyProfile(mood, 2);
  const energyPenalty = profile.penalty(track.energy);
  const sceneFit = track.scene === scene ? 1 : 0;
  const genres = taste ? preferredGenres(taste) : new Set<string>();
  const genreFit = genres.size > 0 && genres.has(track.genreSlug) ? 1 : 0;
  const tasteScore = taste && taste.length > 0 ? buildTasteScore(taste, track) : 0;
  const skipPenalty = energyWeights?.[track.energy] ?? 0;
  return -energyPenalty + sceneFit + genreFit + TASTE_WEIGHT * tasteScore - SKIP_PENALTY_WEIGHT * skipPenalty;
}

export function rankForIntent(
  tracks: BalanceTrack[],
  mood: string,
  scene: string,
  taste?: TastePreference[],
  limit = 24,
): BalanceTrack[] {
  return [...tracks]
    .map((t) => ({ t, score: scoreTrack(t, mood, scene, taste) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.t);
}

export function manifestBalanceTracks(manifest: CatalogManifest): BalanceTrack[] {
  return manifestToTracks(manifest).map((t) => ({
    id: t.id,
    energy: t.energy,
    scene: t.scene,
    genreSlug: t.genreSlug,
    artistSlug: t.artistSlug,
    albumSlug: t.albumSlug,
  }));
}

function scale(goal: number, trackCount: number, at100: number): number {
  return Math.max(1, Math.ceil((at100 * trackCount) / goal));
}

/** Primary moods each artist is expected to serve (expansion plan). */
export const ARTIST_HOME_MOOD: Record<string, string> = {
  "lana-del-delay": "calm",
  "jay-zzz": "mellow",
  "billie-eyelid": "focused",
  "fleetwood-macchiato": "mellow",
  "adele-lay": "warm",
  "justin-tiger": "uplifting",
  "drake-and-bake": "mellow",
  "radioheadache": "focused",
  "kayan-east": "energetic",
  "dua-lift-a": "euphoric",
  "taylor-drift": "energetic",
  "the-bee-geeps": "uplifting",
  "blacksync": "euphoric",
  "nujean": "uplifting",
  "black-toffee": "warm",
  "sawa-node": "energetic",
  "zone-render": "energetic",
  "gtr-808": "energetic",
  "smoke-shift": "energetic",
  "amen-rush": "energetic",
};

const KEY_INTENTS: ReadonlyArray<[mood: string, scene: Scene]> = [
  ["calm", "study"],
  ["calm", "chill"],
  ["mellow", "study"],
  ["focused", "focus"],
  ["warm", "chill"],
  ["uplifting", "commute"],
  ["energetic", "gym"],
  ["euphoric", "party"],
];

export function checkCatalogBalance(manifest: CatalogManifest, options: BalanceOptions = {}): BalanceReport {
  const goal = options.goal ?? 100;
  const envelopePenaltyMax = options.envelopePenaltyMax ?? 2;
  const tracks = manifestBalanceTracks(manifest);
  const trackCount = tracks.length;
  const scaleAt = (n: number) => scale(goal, trackCount, n);
  const taxonomy = new Set(loadGenreTaxonomy().genres.map((g) => g.slug));
  const checks: BalanceCheck[] = [];

  for (const t of manifest.tracks) {
    if (!t.genreSlug || !taxonomy.has(t.genreSlug)) {
      checks.push({
        id: `taxonomy:${t.id}`,
        level: "fail",
        message: `Track ${t.id} missing or unknown genreSlug`,
        detail: { genreSlug: t.genreSlug },
      });
    }
    if (!SCENES.includes(t.scene as Scene)) {
      checks.push({ id: `scene:${t.id}`, level: "fail", message: `Track ${t.id} scene not in UI set`, detail: t.scene });
    }
  }

  for (const a of manifest.artists) {
    if (!a.slug) checks.push({ id: `artist-slug:${a.id}`, level: "fail", message: `Artist ${a.id} missing slug` });
  }
  for (const a of manifest.albums) {
    if (!a.slug) checks.push({ id: `album-slug:${a.id}`, level: "fail", message: `Album ${a.id} missing slug` });
  }

  const genreTarget = scaleAt(10);
  const byGenre = new Map<string, BalanceTrack[]>();
  for (const t of tracks) {
    const list = byGenre.get(t.genreSlug) ?? [];
    list.push(t);
    byGenre.set(t.genreSlug, list);
  }
  for (const [genre, list] of byGenre) {
    const artists = new Set(list.map((t) => t.artistSlug));
    if (list.length < genreTarget) {
      checks.push({
        id: `genre-count:${genre}`,
        level: "warn",
        message: `genre ${genre}: ${list.length}/${genreTarget} tracks toward goal ${goal}`,
      });
    }
    const minArtists = list.length >= scaleAt(5) ? 2 : 1;
    if (artists.size < minArtists) {
      checks.push({
        id: `genre-artists:${genre}`,
        level: list.length >= scaleAt(5) ? "warn" : "pass",
        message: `genre ${genre}: ${artists.size} artist(s) (want ≥${minArtists} at this size)`,
        detail: [...artists],
      });
    }
  }

  for (const [mood, scene] of KEY_INTENTS) {
    const profile = createMoodEnergyProfile(mood, 2);
    const inEnvelope = tracks.filter((t) => profile.penalty(t.energy) <= envelopePenaltyMax);
    const sceneMatched = inEnvelope.filter((t) => t.scene === scene);
    const top24 = rankForIntent(tracks, mood, scene, undefined, 24);
    const top24Scene = top24.filter((t) => t.scene === scene);
    const minPool = scaleAt(15);
    const minScene = scaleAt(8);

    if (inEnvelope.length < minPool) {
      checks.push({
        id: `pool:${mood}+${scene}`,
        level: "warn",
        message: `${mood}+${scene}: ${inEnvelope.length}/${minPool} tracks in mood envelope`,
      });
    }
    if (sceneMatched.length < minScene) {
      checks.push({
        id: `scene-match:${mood}+${scene}`,
        level: "warn",
        message: `${mood}+${scene}: ${sceneMatched.length}/${minScene} envelope+scene matches`,
      });
    }
    if (top24Scene.length < Math.min(minScene, scaleAt(6))) {
      checks.push({
        id: `top24-scene:${mood}+${scene}`,
        level: "warn",
        message: `${mood}+${scene}: only ${top24Scene.length} scene-matched in Top-24`,
      });
    }
  }

  for (const [artistSlug, homeMood] of Object.entries(ARTIST_HOME_MOOD)) {
    const artistTracks = tracks.filter((t) => t.artistSlug === artistSlug);
    if (artistTracks.length === 0) continue;
    const profile = createMoodEnergyProfile(homeMood, 2);
    const inHome = artistTracks.filter((t) => profile.penalty(t.energy) <= envelopePenaltyMax);
    const minHome = scaleAt(4);
    if (inHome.length < minHome) {
      checks.push({
        id: `artist-home:${artistSlug}`,
        level: "warn",
        message: `${artistSlug} @ ${homeMood}: ${inHome.length}/${minHome} tracks in home envelope`,
      });
    }
    const ranked = rankForIntent(tracks, homeMood, "study", [{ entityType: "artist", entityId: artistSlug, polarity: "prefer", source: "onboarding", strength: 3 }], 12);
    const artistInTop = ranked.filter((t) => t.artistSlug === artistSlug).length;
    const minTop = scaleAt(3);
    if (artistInTop < minTop && artistTracks.length >= scaleAt(3)) {
      checks.push({
        id: `artist-prefer:${artistSlug}`,
        level: "warn",
        message: `prefer ${artistSlug} @ ${homeMood}+study: ${artistInTop}/${minTop} in Top-12`,
      });
    }
  }

  const avoidAmbient = rankForIntent(
    tracks,
    "calm",
    "study",
    [{ entityType: "genre", entityId: "ambient", polarity: "avoid", source: "onboarding", strength: 3 }],
    8,
  );
  const ambientInTop8 = avoidAmbient.filter((t) => t.genreSlug === "ambient").length;
  checks.push({
    id: "taste:avoid-ambient-calm-study",
    level: ambientInTop8 <= 1 ? "pass" : "warn",
    message: `avoid ambient @ calm+study: ${ambientInTop8} ambient in Top-8 (want ≤1)`,
  });

  for (const e of ENERGIES) {
    const count = tracks.filter((t) => t.energy === e).length;
    if (count < scaleAt(8)) {
      checks.push({
        id: `energy:${e}`,
        level: "warn",
        message: `energy ${e}: ${count}/${scaleAt(8)} tracks (session feedback fallback)`,
      });
    }
  }

  const passed = checks.filter((c) => c.level === "pass").length;
  const warned = checks.filter((c) => c.level === "warn").length;
  const failed = checks.filter((c) => c.level === "fail").length;
  return { trackCount, goal, checks, passed, warned, failed };
}
