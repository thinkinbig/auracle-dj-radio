import { GoogleGenAI, Type } from "@google/genai";
import type { SpotifyTrackRef, SpotifyVoicing } from "@auracle/shared";

/** Flow-tier model; same override the rest of the stack reads (see .env.example). */
const MODEL = process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Map the model's `[{index, artistPersona, albumConcept}]` reply back onto the
 * input tracks. Pure and total: any track the model skipped — or returned blank
 * — is simply absent (no voicing), so the DJ falls back to a title/artist intro
 * rather than reading an empty blurb. Index-based (not uri-echo) so a mis-quoted
 * uri can't drop a track. Lore is catalog-only (decision 5), never LLM-improvised.
 */
export function parseVoicingReply(raw: unknown, tracks: SpotifyTrackRef[]): Record<string, SpotifyVoicing> {
  const out: Record<string, SpotifyVoicing> = {};
  for (const row of Array.isArray(raw) ? raw : []) {
    const r = row as { index?: unknown; artistPersona?: unknown; albumConcept?: unknown };
    const i = Math.round(Number(r.index));
    const track = Number.isInteger(i) && i >= 0 && i < tracks.length ? tracks[i] : undefined;
    if (!track) continue;
    const artistPersona = str(r.artistPersona);
    const albumConcept = str(r.albumConcept);
    if (!artistPersona && !albumConcept) continue;
    out[track.uri] = { artistPersona, albumConcept, lore: "" };
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

function buildPrompt(tracks: SpotifyTrackRef[]): string {
  return [
    "You write short liner-note blurbs a radio DJ can borrow a phrase from on air.",
    "For each track, write:",
    "- artistPersona: one vivid sentence (≤15 words) capturing the artist's style or vibe.",
    "- albumConcept: one vivid sentence (≤15 words) capturing the album's mood or theme.",
    "Be evocative, not factual claims; never invent biography, awards, or chart history.",
    "Return exactly one object per track, using the index shown.",
    "",
    ...tracks.map((t, i) => `${i}. "${t.title}" — ${t.artist} (${t.albumTitle})`),
  ].join("\n");
}

/**
 * Batched DJ-voicing inference (ADR-0005 §5) for Spotify candidates with no exact
 * catalog match. One structured call over the pool; the caller runs it inside the
 * async copywriter refine, off the first-Start critical path. Best-effort: with no
 * API key, or on any request/parse failure, returns an empty map and the DJ falls
 * back to a plain title/artist introduction.
 */
export async function inferSpotifyVoicing(tracks: SpotifyTrackRef[]): Promise<Record<string, SpotifyVoicing>> {
  if (tracks.length === 0) return {};
  const ai = geminiClient();
  if (!ai) return {};
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(tracks),
      config: { responseMimeType: "application/json", responseSchema: VOICING_SCHEMA },
    });
    return parseVoicingReply(JSON.parse(response.text ?? "null"), tracks);
  } catch {
    return {};
  }
}
