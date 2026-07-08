import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FlowResult, GenreCount, TrackCandidate, TrackMeta } from "@auracle/shared";
import { Catalog, type TrackRow } from "../src/catalog-store.js";
import { HeuristicFlowModel } from "../src/flow/llm/heuristic-flow.js";
import { createPlan, replan } from "../src/flow/plan.js";
import { buildServer, type MusicEngine } from "../src/server.js";

let engine: MusicEngine;
let firstTrackId: string;

beforeAll(async () => {
  const catalog = Catalog.fromManifest();
  firstTrackId = catalog.allTracks()[0]!.id;
  engine = buildServer(catalog);
  await engine.app.ready();
});

afterAll(async () => {
  await engine.app.close();
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

  it("search_catalog ranks session mood by energy envelope and scene", async () => {
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
    // energetic arc [3,5] → candidates span e3/e4/e5; gym@e4+ must appear in the pool
    const res = await engine.app.inject({
      method: "POST",
      url: "/search_catalog",
      payload: { mood: "energetic", scene: "gym", limit: 10 },
    });
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json<{ candidates: TrackCandidate[] }>();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.scene === "gym" && c.energy >= 4)).toBe(true);
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

  it("plan_tracklist returns public cover URLs for local catalog tracks", async () => {
    const res = await engine.app.inject({
      method: "POST",
      url: "/plan_tracklist",
      payload: { mode: "provisional", intent: { mood: "focused", scene: "study" } },
    });
    expect(res.statusCode).toBe(200);
    const { result } = res.json<{ result: FlowResult }>();
    const first = result.tracklist[0]!;
    expect(first.uri).toMatch(/^local:/);
    expect(first.albumCoverUrl).toMatch(/^\/covers\/[^/]+\.jpg$/);
    expect(first.albumCoverUrl).not.toContain("/Users/");
    expect(first.albumCoverUrl).not.toContain("packages/catalog/data");
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

  it("createPlan is deterministic and needs no Flow/Gemini model (P3.2)", async () => {
    const row = (id: string, energy: number, genre: string): TrackRow =>
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
        tempo: 90 + energy,
        genre,
        mood: "calm",
        scene: "study",
        filePath: "",
        introOffsetMs: null,
        instrumental: true,
      }) as TrackRow;
    const deps = { tracks: () => [row("a", 1, "ambient"), row("b", 2, "ambient"), row("c", 3, "house")] };

    const first = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });
    const second = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });

    expect(first.result.tracklist.map((r) => r.id)).toEqual(second.result.tracklist.map((r) => r.id));
    expect(first.result.session_title).not.toContain("vol.");
    expect(first.violations.some((v) => v.kind === "genre_repeat")).toBe(true);
  });

  it("varies station-style session titles by session seed", async () => {
    const deps = { tracks: () => [] };

    const first = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 }, "", undefined, undefined, "seed-a");
    const second = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 }, "", undefined, undefined, "seed-c");

    expect(first.result.session_title).not.toContain("vol.");
    expect(first.result.session_title).not.toEqual(second.result.session_title);
  });

  it("heuristic flow orders calm sessions inside the low-energy arc", async () => {
    const model = new HeuristicFlowModel();
    const candidates: TrackCandidate[] = [1, 1, 1, 1, 2, 2, 2, 2, 4, 5].map((energy, i) => ({
      id: `calm-${i}`,
      energy,
      tempo: 80 + i,
      genre: `g${i}`,
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

  it("heuristic flow plan produces no duplicate track ids", async () => {
    const model = new HeuristicFlowModel();
    const candidates = ([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2] as const).map((energy, i) => ({
      id: `t${i}`,
      energy,
      tempo: 80 + i * 3,
      genre: `g${i % 4}`,
      scene: "study",
    })) as TrackCandidate[];
    const result = await model.plan({
      intent: { mood: "focused", scene: "study", duration_min: 25 },
      memories: "",
      played: [],
      lastPlayedEnergy: null,
      remainingSlots: 8,
      candidates,
    });
    const ids = result.tracklist.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("heuristic flow gives euphoric sessions a high-energy peak", async () => {
    const model = new HeuristicFlowModel();
    const candidates: TrackCandidate[] = [4, 4, 4, 4, 5, 5, 5, 5, 1, 2].map((energy, i) => ({
      id: `euphoric-${i}`,
      energy,
      tempo: 90 + i,
      genre: `g${i}`,
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

  it("replan treats memories as planner context, not retrieval weights", async () => {
    const row = (id: string, energy: number, genre: string): TrackRow =>
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
        tempo: 90 + energy,
        genre,
        genreSlug: genre,
        artistSlug: "a",
        albumSlug: "al",
        mood: "euphoric",
        scene: "party",
        filePath: "",
        introOffsetMs: null,
        instrumental: true,
      }) as TrackRow;
    // euphoric arc covers e4+e5 → "high" (e5) enters the candidate pool
    const deps = { tracks: () => [row("low", 4, "house"), row("high", 5, "techno"), row("mid", 4, "ambient")] };
    const base = { intent: { mood: "euphoric", scene: "party", duration_min: 25 }, playedIds: [], played: [], lastPlayedEnergy: null, remainingSlots: 2 };

    const withContext = await replan(deps, { ...base, memories: "Spotify-derived Auracle taste summary: Top genres: techno." });
    const withoutContext = await replan(deps, base);

    expect(withContext.result.tracklist.map((r) => r.id)).not.toEqual([]);
    expect(withoutContext.result.tracklist.map((r) => r.id)).not.toEqual([]);
    expect(withContext.candidatesById.has("high")).toBe(true);
    expect(withContext.candidatesById).toEqual(withoutContext.candidatesById);
  });

  it("GET /tracks/:id returns metadata incl. genreSlug, 404 for unknown", async () => {
    const ok = await engine.app.inject({ method: "GET", url: `/tracks/${firstTrackId}` });
    expect(ok.statusCode).toBe(200);
    const meta = ok.json<TrackMeta>();
    expect(meta.id).toBe(firstTrackId);
    expect(meta.genreSlug.length).toBeGreaterThan(0);
    expect(meta.artistSlug.length).toBeGreaterThan(0);
    // Artist persona + album concept survive the manifest → DB → TrackMeta roundtrip
    // so the DJ can introduce creation context on air (#52).
    expect(meta.artistPersona.length).toBeGreaterThan(0);
    expect(meta.albumConcept.length).toBeGreaterThan(0);

    const missing = await engine.app.inject({ method: "GET", url: "/tracks/does-not-exist" });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /catalog/genres returns taxonomy slugs with counts summing to the catalog", async () => {
    const res = await engine.app.inject({ method: "GET", url: "/catalog/genres" });
    expect(res.statusCode).toBe(200);
    const { genres } = res.json<{ genres: GenreCount[]; revision: string }>();
    expect(genres.length).toBeGreaterThan(0);
    expect(genres[0]).toEqual(expect.objectContaining({ slug: expect.any(String), label: expect.any(String), count: expect.any(Number) }));

    const totalTracks = engine.catalog.allTracks().length;
    const counted = genres.reduce((sum, g) => sum + g.count, 0);
    expect(counted).toBe(totalTracks);
  });

  it("structured taste shifts the candidate pool (S4)", async () => {
    const genreById = new Map(engine.catalog.allTracks().map((t) => [t.id, t.genreSlug]));

    async function planCandidates(taste?: unknown): Promise<TrackCandidate[]> {
      const res = await engine.app.inject({
        method: "POST",
        url: "/plan_tracklist",
        // uplifting arc [2.5,4.5] → buckets {2,3,4,5} → 24+ candidates across genres
        payload: { mode: "provisional", intent: { mood: "uplifting", scene: "study" }, taste },
      });
      expect(res.statusCode).toBe(200);
      return res.json<{ candidates: TrackCandidate[] }>().candidates;
    }
    const baseline = await planCandidates();
    // Pick a genre already present in this intent's baseline pool so avoid/prefer
    // can produce an observable delta after energy-bucket truncation.
    const counts = new Map<string, number>();
    for (const c of baseline) {
      const genre = genreById.get(c.id);
      if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    const targetGenre = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const countGenre = (cands: TrackCandidate[]) => cands.filter((c) => genreById.get(c.id) === targetGenre).length;
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
