#!/usr/bin/env node
/**
 * Objective audio-feature metrics (doc/auracle_evaluation_design.md) over one
 * or more frozen session artifacts produced by baseline-a.ts / freeze-bc.ts.
 * All inputs (energy, tempo, genre) come from catalog metadata already
 * embedded in those artifacts — no Spotify lookup needed at eval time.
 */
import { readFile } from "node:fs/promises";
import { ARC_BANDS, FULL_SESSION_LENGTH } from "@auracle/shared";

interface FrozenTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  energy: number;
  tempo: number;
}

interface FrozenSession {
  condition: "A" | "B" | "C";
  intent: { mood: string; scene: string; duration_min: number };
  tracklist: FrozenTrack[];
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function adjacentDeltas(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) out.push(values[i]! - values[i - 1]!);
  return out;
}

/** MSE between actual energy and the midpoint of ARC_BANDS' target band per 1-based position. */
function arcAdherence(energies: number[]): number | null {
  if (energies.length !== FULL_SESSION_LENGTH) return null;
  const squaredErrors = energies.map((e, i) => {
    const band = ARC_BANDS[i + 1];
    if (!band) return 0;
    const target = (band.min + band.max) / 2;
    return (e - target) ** 2;
  });
  return squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length;
}

/** Shannon entropy (bits) of the genre distribution. */
function genreDiversity(genres: string[]): number {
  const counts = new Map<string, number>();
  for (const g of genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  const n = genres.length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function computeMetrics(session: FrozenSession) {
  const energies = session.tracklist.map((t) => t.energy);
  const tempos = session.tracklist.map((t) => t.tempo);
  const genres = session.tracklist.map((t) => t.genre);
  return {
    condition: session.condition,
    intent: session.intent,
    track_count: session.tracklist.length,
    energy_smoothness: Number(stdev(adjacentDeltas(energies)).toFixed(3)),
    tempo_smoothness: Number(stdev(adjacentDeltas(tempos)).toFixed(3)),
    arc_adherence_mse: (() => {
      const v = arcAdherence(energies);
      return v === null ? null : Number(v.toFixed(3));
    })(),
    genre_diversity_entropy: Number(genreDiversity(genres).toFixed(3)),
  };
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("usage: tsx src/eval/metrics.ts <session.json> [session2.json ...]");
    process.exit(2);
  }

  const results = [];
  for (const path of paths) {
    const raw = JSON.parse(await readFile(path, "utf-8")) as FrozenSession;
    results.push({ path, ...computeMetrics(raw) });
  }

  for (const r of results) {
    console.log(`${r.path}`);
    console.log(`  condition=${r.condition} "${r.intent.mood} ${r.intent.scene}" (${r.track_count} tracks)`);
    console.log(`  energy_smoothness=${r.energy_smoothness}  tempo_smoothness=${r.tempo_smoothness}`);
    console.log(`  arc_adherence_mse=${r.arc_adherence_mse ?? "n/a (not " + FULL_SESSION_LENGTH + " tracks)"}`);
    console.log(`  genre_diversity_entropy=${r.genre_diversity_entropy}`);
  }

  console.log(`\n${JSON.stringify(results, null, 2)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
