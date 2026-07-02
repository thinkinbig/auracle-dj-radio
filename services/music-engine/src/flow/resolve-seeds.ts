import { GoogleGenAI, Type } from "@google/genai";
import type { Energy, TrackSeed, Voicing } from "@auracle/shared";
import type { SeedResolution } from "./plan.js";

/**
 * LLM resolution of energy + DJ voicing for externally-seeded tracks with no exact
 * catalog match (ADR-0005 §4–5). This is the deep implementation behind
 * `PlanDeps.resolveSeeds`: two batched, structured Gemini calls whose results are
 * memoized by uri so a session's provisional→full→replan→extend passes infer each
 * track at most once. Best-effort and total — with no API key, or on any request/
 * parse failure, energy falls back to mid-arc and voicing is omitted (the DJ then
 * introduces the track by title/artist), so ranking and playback still proceed.
 */

/** Flow-tier model; same override the rest of the stack reads (see .env.example). */
const MODEL = process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite";
const MID_ENERGY: Energy = 3;

/** uri→resolved value; inference is track-specific (not user-specific) so it is shared across sessions. */
const RESOLVE_CACHE_MAX = 4096;
const cache = new Map<string, { energy: Energy; voicing?: Voicing }>();

function cacheSet(uri: string, value: { energy: Energy; voicing?: Voicing }): void {
  cache.delete(uri);
  cache.set(uri, value);
  if (cache.size > RESOLVE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function clampEnergy(value: unknown): Energy {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MID_ENERGY;
  return Math.min(5, Math.max(1, n)) as Energy;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

let client: GoogleGenAI | undefined;
function geminiClient(): GoogleGenAI | undefined {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

const ENERGY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { index: { type: Type.INTEGER }, energy: { type: Type.INTEGER } },
    required: ["index", "energy"],
  },
};

const VOICING_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER },
      artistPersona: { type: Type.STRING },
      albumConcept: { type: Type.STRING },
    },
    required: ["index", "artistPersona", "albumConcept"],
  },
};

/**
 * Map the model's `[{index, energy}]` reply back onto the input tracks. Total: any
 * track the model skipped — or returned out of range / unparseable — falls back to
 * mid energy. Index-based (not uri-echo) so a mis-quoted uri can't drop a track.
 */
function parseEnergyReply(raw: unknown, tracks: TrackSeed[]): Record<string, Energy> {
  const out: Record<string, Energy> = {};
  for (const t of tracks) out[t.uri] = MID_ENERGY;
  for (const row of Array.isArray(raw) ? raw : []) {
    const r = row as { index?: unknown; energy?: unknown };
    const i = Math.round(Number(r.index));
    const track = Number.isInteger(i) && i >= 0 && i < tracks.length ? tracks[i] : undefined;
    if (track) out[track.uri] = clampEnergy(r.energy);
  }
  return out;
}

/**
 * Map the model's voicing reply onto the input tracks. A track the model skipped or
 * returned blank is simply absent (no voicing). Lore is catalog-only (ADR-0005 §5),
 * never LLM-improvised.
 */
function parseVoicingReply(raw: unknown, tracks: TrackSeed[]): Record<string, Voicing> {
  const out: Record<string, Voicing> = {};
  for (const row of Array.isArray(raw) ? raw : []) {
    const r = row as { index?: unknown; artistPersona?: unknown; albumConcept?: unknown };
    const i = Math.round(Number(r.index));
    const track = Number.isInteger(i) && i >= 0 && i < tracks.length ? tracks[i] : undefined;
    if (!track) continue;
    const artistPersona = str(r.artistPersona);
    const albumConcept = str(r.albumConcept);
    // Both fields are required in the schema; a reply with only one populated is a
    // partial/malformed row, not a real (half-empty) voicing — treat it as skipped
    // like a fully-blank row, rather than surfacing an incomplete introduction.
    if (!artistPersona || !albumConcept) continue;
    out[track.uri] = { artistPersona, albumConcept, lore: "" };
  }
  return out;
}

function energyPrompt(tracks: TrackSeed[]): string {
  // Arc calibration (#78): these ratings place each seeded track on the same 1–5
  // energy arc as the curated catalog, where adjacent slots differ by ~1. A model
  // that hedges everything to 3 flattens the arc, so we ask it to commit and use
  // the full range — judging each track on its own feel.
  return [
    "Rate the listening energy of each track on an integer scale of 1 to 5:",
    "1 = very calm/ambient, 2 = relaxed, 3 = moderate, 4 = upbeat/driving, 5 = very high energy/intense.",
    "Judge by the recording's typical feel (tempo, intensity, loudness), not the lyrics.",
    "Commit to a clear rating per track and use the full 1–5 range where warranted — do not default to 3 when unsure.",
    "Return exactly one {index, energy} object per track, using the index shown.",
    "",
    ...tracks.map((t, i) => `${i}. "${t.title}" — ${t.artist} (${t.albumTitle})`),
  ].join("\n");
}

function voicingPrompt(tracks: TrackSeed[]): string {
  // Voice calibration (#78): the host always speaks English and borrows ONE short
  // phrase from these blurbs on air. Match the catalog's authored house style —
  // present-tense, concrete sensory imagery, no biography — so a seeded track reads
  // the same as a catalog one when introduced.
  //
  // HITL pass (#78): live-tested this prompt against real seeds and compared the
  // output to actual catalog artistPersona/albumConcept text. The original exemplars
  // below produced technically-correct but generic "evocative mood" copy (e.g. "A
  // synth-obsessed phantom stalking neon-drenched boulevards"), while the catalog's
  // real house voice leans specific and a little witty — a concrete, sometimes funny
  // detail, not just atmosphere (e.g. "the name is the signal chain", "the turnstile
  // beeps in harmony"). Swapped the exemplars for ones demonstrating that specificity;
  // still original lines (not copied from the catalog) per the existing house-voice
  // policy — they set register without being copied.
  return [
    "You write short liner-note blurbs a radio DJ borrows a phrase from on air.",
    "Write in English. Use present tense and concrete, sensory imagery — evocative mood, not factual claims.",
    "Be specific and a little witty — a concrete detail or unexpected image, not just atmosphere.",
    "Never invent biography, awards, chart history, or band members.",
    "For each track, write:",
    "- artistPersona: one vivid sentence (≤15 words) capturing the artist's style or vibe.",
    "- albumConcept: one vivid sentence (≤15 words) capturing the album's mood or theme.",
    'Style to match: artistPersona like "A synth hoarder who names every track after a gas station he\'s slept in."; albumConcept like "A breakup record disguised as a highway map — every chorus another exit missed.".',
    "Return exactly one object per track, using the index shown.",
    "",
    ...tracks.map((t, i) => `${i}. "${t.title}" — ${t.artist} (${t.albumTitle})`),
  ].join("\n");
}

async function inferEnergy(ai: GoogleGenAI, tracks: TrackSeed[]): Promise<Record<string, Energy>> {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: energyPrompt(tracks),
      config: { responseMimeType: "application/json", responseSchema: ENERGY_SCHEMA },
    });
    return parseEnergyReply(JSON.parse(response.text ?? "null"), tracks);
  } catch {
    return parseEnergyReply(undefined, tracks);
  }
}

async function inferVoicing(ai: GoogleGenAI, tracks: TrackSeed[]): Promise<Record<string, Voicing>> {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: voicingPrompt(tracks),
      config: { responseMimeType: "application/json", responseSchema: VOICING_SCHEMA },
    });
    return parseVoicingReply(JSON.parse(response.text ?? "null"), tracks);
  } catch {
    return {};
  }
}

/** `PlanDeps.resolveSeeds`: cache-through batched inference of energy + voicing. */
export async function resolveSeeds(seeds: TrackSeed[]): Promise<SeedResolution> {
  const energy: Record<string, Energy> = {};
  const voicing: Record<string, Voicing> = {};
  const misses: TrackSeed[] = [];
  for (const s of seeds) {
    const hit = cache.get(s.uri);
    if (hit) {
      energy[s.uri] = hit.energy;
      if (hit.voicing) voicing[s.uri] = hit.voicing;
    } else {
      misses.push(s);
    }
  }
  if (misses.length === 0) return { energy, voicing };

  const ai = geminiClient();
  if (!ai) {
    // No inference available: mid energy, no voicing. Cache so we don't retry.
    for (const s of misses) {
      energy[s.uri] = MID_ENERGY;
      cacheSet(s.uri, { energy: MID_ENERGY });
    }
    return { energy, voicing };
  }

  const [energyMap, voicingMap] = await Promise.all([inferEnergy(ai, misses), inferVoicing(ai, misses)]);
  for (const s of misses) {
    const e = energyMap[s.uri] ?? MID_ENERGY;
    const v = voicingMap[s.uri];
    energy[s.uri] = e;
    if (v) voicing[s.uri] = v;
    cacheSet(s.uri, { energy: e, voicing: v });
  }
  return { energy, voicing };
}

/** @internal test helper */
export function resetSeedResolutionCacheForTests(): void {
  cache.clear();
}
