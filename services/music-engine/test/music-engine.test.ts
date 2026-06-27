import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FlowResult, GenreCount, TrackCandidate, TrackMeta } from "@auracle/shared";
import { CatalogDb, type TrackRow } from "../src/catalog-db.js";
import type { FlowInput, FlowModel } from "../src/flow/llm/flow-model.js";
import { HeuristicFlowModel } from "../src/flow/llm/heuristic-flow.js";
import { replan } from "../src/flow/plan.js";
import { energyWeightsFromMemories, mergeEnergyWeights } from "../src/flow/weighting/memory-energy.js";
import { resolveCatalogPath, tracksWithAssets } from "../src/catalog/manifest.js";
import { buildServer, type MusicEngine } from "../src/server.js";

let engine: MusicEngine;
let firstTrackId: string;

/** Seed a throwaway catalog DB from the manifest (structured metadata only). */
async function seedTempDb(): Promise<string> {
  const dbPath = join(mkdtempSync(join(tmpdir(), "music-engine-")), "catalog.sqlite");
  const db = new CatalogDb(dbPath);
  const tracks = tracksWithAssets();
  for (const t of tracks) {
    const row: TrackRow = {
      ...t,
      filePath: resolveCatalogPath(t.filePath),
      albumCoverPath: resolveCatalogPath(t.albumCoverPath),
      artistPhotoPath: resolveCatalogPath(t.artistPhotoPath),
    };
    db.upsertTrack(row);
  }
  firstTrackId = tracks[0]!.id;
  db.close();
  return dbPath;
}

beforeAll(async () => {
  const dbPath = await seedTempDb();
  engine = buildServer(dbPath);
  await engine.app.ready();
});

afterAll(async () => {
  await engine.app.close();
  engine.db.close();
});

describe("music-engine HTTP", () => {
  it("seeds a non-empty catalog", async () => {
    const res = await engine.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ tracks: number }>().tracks).toBeGreaterThan(0);
  });

  it("search_catalog returns ranked candidates", async () => {
    const res = await engine.app.inject({
      method: "POST",
      url: "/search_catalog",
      payload: { mood: "calm", scene: "study", limit: 8 },
    });
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json<{ candidates: TrackCandidate[] }>();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates[0]).toHaveProperty("id");
  });

  it("search_catalog ranks exact mood+scene matches highest", async () => {
    // t01 has energy=1 + scene=study — best fit for calm+study structured scoring
    const res = await engine.app.inject({
      method: "POST",
      url: "/search_catalog",
      payload: { mood: "calm", scene: "study", limit: 10 },
    });
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json<{ candidates: TrackCandidate[] }>();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.id).toBe("t01");
  });

  it("search_catalog ranks energetic+gym matches high", async () => {
    // energetic+gym should surface gym tracks at peak envelope energy (4+)
    const res = await engine.app.inject({
      method: "POST",
      url: "/search_catalog",
      payload: { mood: "energetic", scene: "gym", limit: 10 },
    });
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json<{ candidates: TrackCandidate[] }>();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.scene).toBe("gym");
    expect(candidates[0]!.energy).toBeGreaterThanOrEqual(4);
  });

  it("search_catalog rejects a missing scene", async () => {
    const res = await engine.app.inject({ method: "POST", url: "/search_catalog", payload: { mood: "calm" } });
    expect(res.statusCode).toBe(400);
  });

  it("plan_tracklist (provisional) returns a contiguous tracklist", async () => {
    const res = await engine.app.inject({
      method: "POST",
      url: "/plan_tracklist",
      payload: { mode: "provisional", intent: { mood: "calm", scene: "study" } },
    });
    expect(res.statusCode).toBe(200);
    const { result } = res.json<{ result: FlowResult }>();
    expect(result.tracklist.length).toBeGreaterThan(0);
    result.tracklist.forEach((ref, i) => expect(ref.flow_position).toBe(i + 1));
  });

  it("plan_tracklist (full) orders candidates and reports violations", async () => {
    const res = await engine.app.inject({
      method: "POST",
      url: "/plan_tracklist",
      payload: { intent: { mood: "calm", scene: "study" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ result: FlowResult; violations: unknown[]; candidates: TrackCandidate[] }>();
    expect(body.result.tracklist.length).toBeGreaterThan(0);
    expect(Array.isArray(body.violations)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);
  }, 10_000);

  it("heuristic flow orders calm sessions inside the low-energy arc", async () => {
    const model = new HeuristicFlowModel();
    const candidates: TrackCandidate[] = [1, 1, 1, 1, 2, 2, 2, 2, 4, 5].map((energy, i) => ({
      id: `calm-${i}`,
      energy,
      tempo: 80 + i,
      genre: `g${i}`,
      mood: "calm",
      scene: "study",
    }));

    const result = await model.plan({
      intent: { mood: "calm", scene: "study", duration_min: 25 },
      memories: "",
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 8,
      candidates,
    });

    const picked = result.tracklist.map((ref) => candidates.find((c) => c.id === ref.id)!.energy);
    expect(picked.every((energy) => energy <= 2)).toBe(true);
  });

  it("heuristic flow gives euphoric sessions a high-energy peak", async () => {
    const model = new HeuristicFlowModel();
    const candidates: TrackCandidate[] = [4, 4, 4, 4, 5, 5, 5, 5, 1, 2].map((energy, i) => ({
      id: `euphoric-${i}`,
      energy,
      tempo: 90 + i,
      genre: `g${i}`,
      mood: "euphoric",
      scene: "party",
    }));

    const result = await model.plan({
      intent: { mood: "euphoric", scene: "party", duration_min: 25 },
      memories: "",
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 8,
      candidates,
    });

    const picked = result.tracklist.map((ref) => candidates.find((c) => c.id === ref.id)!.energy);
    expect(Math.max(...picked)).toBeGreaterThanOrEqual(4);
    expect(picked.every((energy) => energy >= 4)).toBe(true);
  });

  it("plan_tracklist (extend) appends fresh tracks excluding played ids (E1)", async () => {
    const search = await engine.app.inject({
      method: "POST",
      url: "/search_catalog",
      payload: { mood: "calm", scene: "study", limit: 5 },
    });
    const exclude = search.json<{ candidates: TrackCandidate[] }>().candidates.slice(0, 2).map((c) => c.id);

    const res = await engine.app.inject({
      method: "POST",
      url: "/plan_tracklist",
      payload: {
        mode: "extend",
        intent: { mood: "calm", scene: "study" },
        extend: { playedIds: exclude, appendSlots: 4, lastPlayedEnergy: 2 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ result: FlowResult; candidates: TrackCandidate[] }>();
    expect(body.result.tracklist.length).toBeGreaterThan(0);
    expect(body.result.tracklist.length).toBeLessThanOrEqual(4);
    body.result.tracklist.forEach((ref, i) => expect(ref.flow_position).toBe(i + 1)); // contiguous
    const trackIds = body.result.tracklist.map((r) => r.id);
    for (const ex of exclude) expect(trackIds).not.toContain(ex); // excludes played
  });

  it("replan forwards mem0 recall into the flow input (P0-5)", async () => {
    const row = (id: string, energy: number): TrackRow =>
      ({
        id,
        title: id,
        artist: "a",
        artistId: "ar",
        albumId: "al",
        albumTitle: "al",
        lore: "",
        albumCoverPath: "",
        artistPhotoPath: "",
        energy,
        tempo: 90,
        genre: "g",
        mood: "calm",
        scene: "study",
        filePath: "",
        introOffsetMs: null,
        instrumental: true,
      }) as TrackRow;
    class CapturingFlow implements FlowModel {
      last?: FlowInput;
      async plan(input: FlowInput): Promise<FlowResult> {
        this.last = input;
        return {
          session_title: "t",
          session_subtitle: "s",
          arc: "build",
          tracklist: input.candidates.map((c, i) => ({ id: c.id, flow_position: i + 1, reason: "x" })),
        };
      }
    }
    const flow = new CapturingFlow();
    const deps = { flowModel: flow, tracks: () => [row("a", 2), row("b", 4)] };
    const base = { intent: { mood: "calm", scene: "study", duration_min: 25 }, playedIds: [], played: [], lastPlayedEnergy: null, remainingSlots: 2 };

    await replan(deps, { ...base, memories: "prefers lighter energy" });
    expect(flow.last?.memories).toBe("prefers lighter energy");

    await replan(deps, base);
    expect(flow.last?.memories).toBe("");
  });

  it("derives bounded energy penalties from high-signal mem0 facts", () => {
    expect(energyWeightsFromMemories("- User prefers lighter energy during studying sessions")).toEqual({ 4: 0.45, 5: 0.7 });
    expect(energyWeightsFromMemories("User skipped energy 3 tracks quickly")).toEqual({ 3: 0.7 });
    expect(mergeEnergyWeights({ 5: 0.2, 2: 0.4 }, { 5: 0.7, 4: 0.45 })).toEqual({ 2: 0.4, 4: 0.45, 5: 0.7 });
  });

  it("GET /tracks/:id returns metadata incl. genreSlug, 404 for unknown", async () => {
    const ok = await engine.app.inject({ method: "GET", url: `/tracks/${firstTrackId}` });
    expect(ok.statusCode).toBe(200);
    const meta = ok.json<TrackMeta>();
    expect(meta.id).toBe(firstTrackId);
    expect(meta.genreSlug.length).toBeGreaterThan(0);
    expect(meta.artistSlug.length).toBeGreaterThan(0);

    const missing = await engine.app.inject({ method: "GET", url: "/tracks/does-not-exist" });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /catalog/genres returns taxonomy slugs with counts summing to the catalog", async () => {
    const res = await engine.app.inject({ method: "GET", url: "/catalog/genres" });
    expect(res.statusCode).toBe(200);
    const { genres } = res.json<{ genres: GenreCount[]; revision: string }>();
    expect(genres.length).toBeGreaterThan(0);
    expect(genres[0]).toEqual(expect.objectContaining({ slug: expect.any(String), label: expect.any(String), count: expect.any(Number) }));

    const totalTracks = engine.db.allTracks().length;
    const counted = genres.reduce((sum, g) => sum + g.count, 0);
    expect(counted).toBe(totalTracks);
  });

  it("structured taste shifts the candidate pool (S4)", async () => {
    const genreById = new Map(engine.db.allTracks().map((t) => [t.id, t.genreSlug]));
    // Pick a genre that has several tracks so a shift is observable.
    const counts = new Map<string, number>();
    for (const g of genreById.values()) counts.set(g, (counts.get(g) ?? 0) + 1);
    const targetGenre = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

    async function planCandidates(taste?: unknown): Promise<TrackCandidate[]> {
      const res = await engine.app.inject({
        method: "POST",
        url: "/plan_tracklist",
        payload: { mode: "provisional", intent: { mood: "calm", scene: "studying" }, taste },
      });
      expect(res.statusCode).toBe(200);
      return res.json<{ candidates: TrackCandidate[] }>().candidates;
    }
    const countGenre = (cands: TrackCandidate[]) => cands.filter((c) => genreById.get(c.id) === targetGenre).length;

    const baseline = await planCandidates();
    const avoided = await planCandidates([
      { entityType: "genre", entityId: targetGenre, polarity: "avoid", strength: 3, source: "onboarding" },
    ]);
    const preferred = await planCandidates([
      { entityType: "genre", entityId: targetGenre, polarity: "prefer", strength: 3, source: "onboarding" },
    ]);

    // Avoiding the genre reduces its presence below the baseline.
    expect(countGenre(avoided)).toBeLessThan(countGenre(baseline));
    // Two users with opposing prefs on the same intent get different sequences.
    expect(preferred.map((c) => c.id)).not.toEqual(avoided.map((c) => c.id));
    expect(countGenre(preferred)).toBeGreaterThan(countGenre(avoided));
  });
});
