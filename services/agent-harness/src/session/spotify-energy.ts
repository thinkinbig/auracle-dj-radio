import { GoogleGenAI, Type } from "@google/genai";
import type { Energy, SpotifyTrackRef } from "@auracle/shared";

/** Fallback when inference is unavailable or a track is missing/out of range. */
const MID_ENERGY: Energy = 3;
/** Flow-tier model; same override the rest of the stack reads (see .env.example). */
const MODEL = process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite";

function clampEnergy(value: unknown): Energy {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MID_ENERGY;
  return Math.min(5, Math.max(1, n)) as Energy;
}

/**
 * Map the model's `[{index, energy}]` reply back onto the input tracks. Pure and
 * total: any track the model skipped — or returned out of range / unparseable —
 * falls back to mid energy, so the caller always gets a complete uri→Energy map.
 * Index-based (not uri-echo) so a mis-quoted uri can't drop a track.
 */
export function parseEnergyReply(raw: unknown, tracks: SpotifyTrackRef[]): Record<string, Energy> {
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
    properties: {
      index: { type: Type.INTEGER },
      energy: { type: Type.INTEGER },
    },
    required: ["index", "energy"],
  },
};

function buildPrompt(tracks: SpotifyTrackRef[]): string {
  return [
    "Rate the listening energy of each track on an integer scale of 1 to 5:",
    "1 = very calm/ambient, 2 = relaxed, 3 = moderate, 4 = upbeat/driving, 5 = very high energy/intense.",
    "Judge by the recording's typical feel (tempo, intensity, loudness), not the lyrics.",
    "Return exactly one {index, energy} object per track, using the index shown.",
    "",
    ...tracks.map((t, i) => `${i}. "${t.title}" — ${t.artist} (${t.albumTitle})`),
  ].join("\n");
}

/**
 * Batched energy inference (ADR-0005 §4–5) for Spotify candidates with no exact
 * catalog match. One structured call over the whole pool; the caller runs it inside
 * the async copywriter refine, off the first-Start critical path. Best-effort and
 * total: with no API key, or on any request/parse failure, every track falls back
 * to mid energy so ranking still proceeds.
 */
export async function inferSpotifyEnergy(tracks: SpotifyTrackRef[]): Promise<Record<string, Energy>> {
  if (tracks.length === 0) return {};
  const ai = geminiClient();
  if (!ai) return parseEnergyReply(undefined, tracks);
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(tracks),
      config: { responseMimeType: "application/json", responseSchema: ENERGY_SCHEMA },
    });
    return parseEnergyReply(JSON.parse(response.text ?? "null"), tracks);
  } catch {
    return parseEnergyReply(undefined, tracks);
  }
}
