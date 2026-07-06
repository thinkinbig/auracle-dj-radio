#!/usr/bin/env node
/**
 * Condition A baseline (doc/auracle_evaluation_design.md): an external LLM
 * picks and orders tracks directly, with no flow arc/energy sequencing and no
 * personalization — the "just ask an LLM" comparison point for Auracle's own
 * flow orchestration + memory (Condition C).
 *
 * The candidate pool is catalog tracks whose curator `scene` tag matches the
 * requested scene (same aliasing as flow retrieval) — pure relevance
 * filtering, not the mood-energy scoring under test. Everything past that
 * (which tracks, what order) is the model's call alone, so the resulting
 * tracklist is directly comparable to B/C on the same energy/tempo/genre
 * metadata without needing Spotify lookups.
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import type { SessionIntent, Track } from "@auracle/shared";
import { Catalog } from "../catalog-store.js";
import { normalizeScene } from "../flow/retrieval/retrieve.js";

const MODEL = process.env.GEMINI_BASELINE_MODEL ?? "gemini-3.1-flash-lite";
const TRACKLIST_SIZE = 8;

const TRACKLIST_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { index: { type: Type.INTEGER } },
    required: ["index"],
  },
};

function candidatePool(tracks: Track[], scene: string): Track[] {
  const target = normalizeScene(scene);
  return tracks.filter((t) => normalizeScene(t.scene) === target);
}

function playlistPrompt(intent: SessionIntent, candidates: Track[]): string {
  return [
    `Build a ${intent.duration_min}-minute, ${TRACKLIST_SIZE}-track playlist for: "${intent.mood} ${intent.scene}".`,
    "Pick whichever tracks fit best and put them in whatever order you think listeners would enjoy most.",
    `Return exactly ${TRACKLIST_SIZE} {index} objects, using the index shown below, in play order.`,
    "",
    ...candidates.map((t, i) => `${i}. "${t.title}" — ${t.artist} (${t.genre}, energy ${t.energy}/5, ${t.tempo} BPM)`),
  ].join("\n");
}

function parseTracklistReply(raw: unknown, candidates: Track[]): Track[] {
  const seen = new Set<number>();
  const out: Track[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const i = Math.round(Number((row as { index?: unknown }).index));
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue;
    seen.add(i);
    out.push(candidates[i]!);
    if (out.length === TRACKLIST_SIZE) break;
  }
  return out;
}

async function main(): Promise<void> {
  const [, , moodArg, sceneArg, durationArg] = process.argv;
  if (!moodArg || !sceneArg) {
    console.error("usage: tsx src/eval/baseline-a.ts <mood> <scene> [duration_min]");
    process.exit(2);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const intent: SessionIntent = { mood: moodArg, scene: sceneArg, duration_min: durationArg ? Number(durationArg) : 25 };
  const catalog = Catalog.fromManifest();
  const candidates = candidatePool(catalog.allTracks(), intent.scene);
  if (candidates.length < TRACKLIST_SIZE) {
    throw new Error(`only ${candidates.length} catalog tracks match scene "${intent.scene}" — need at least ${TRACKLIST_SIZE}`);
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: playlistPrompt(intent, candidates),
    config: { responseMimeType: "application/json", responseSchema: TRACKLIST_SCHEMA },
  });
  const tracklist = parseTracklistReply(JSON.parse(response.text ?? "null"), candidates);
  if (tracklist.length < TRACKLIST_SIZE) {
    throw new Error(`model returned ${tracklist.length}/${TRACKLIST_SIZE} valid tracks — retry`);
  }

  const report = {
    condition: "A" as const,
    intent,
    generated_at: new Date().toISOString(),
    tracklist: tracklist.map((t) => ({ id: t.id, title: t.title, artist: t.artist, genre: t.genre, energy: t.energy, tempo: t.tempo })),
  };
  const output = process.env.BASELINE_A_OUTPUT ?? join(tmpdir(), `auracle-baseline-a-${Date.now()}.json`);
  await writeFile(output, JSON.stringify(report, null, 2));

  console.log(`condition A: "${intent.mood} ${intent.scene}" (${intent.duration_min} min)`);
  for (const t of report.tracklist) console.log(`  ${t.energy}/5 ${t.tempo}bpm  "${t.title}" — ${t.artist} (${t.genre})`);
  console.log(`\nreport: ${output}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
