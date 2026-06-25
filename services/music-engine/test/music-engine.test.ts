import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FlowResult, TrackCandidate, TrackMeta } from "@auracle/shared";
import { CatalogDb, type TrackRow } from "../src/catalog-db.js";
import { config } from "../src/config.js";
import { HashEmbedder } from "../src/flow/embedder.js";
import { resolveCatalogPath, tracksWithAssets } from "../src/catalog/manifest.js";
import { buildServer, type MusicEngine } from "../src/server.js";

let engine: MusicEngine;
let firstTrackId: string;

/** Seed a throwaway catalog DB from the manifest using the offline HashEmbedder. */
async function seedTempDb(): Promise<string> {
  const dbPath = join(mkdtempSync(join(tmpdir(), "music-engine-")), "catalog.sqlite");
  const db = new CatalogDb(dbPath);
  const embedder = new HashEmbedder();
  const tracks = tracksWithAssets();
  for (const t of tracks) {
    const filePath = resolveCatalogPath(t.filePath);
    const row: TrackRow = {
      ...t,
      filePath,
      albumCoverPath: resolveCatalogPath(t.albumCoverPath),
      artistPhotoPath: resolveCatalogPath(t.artistPhotoPath),
      embedding: await embedder.embedTrack({ ...t, filePath }),
    };
    db.upsertTrack(row);
  }
  firstTrackId = tracks[0]!.id;
  db.close();
  return dbPath;
}

beforeAll(async () => {
  config.geminiApiKey = undefined;
  config.embedder = "hash";
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
      payload: { mood: "calm", scene: "studying", limit: 8 },
    });
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json<{ candidates: TrackCandidate[] }>();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates[0]).toHaveProperty("id");
  });

  it("search_catalog rejects a missing scene", async () => {
    const res = await engine.app.inject({ method: "POST", url: "/search_catalog", payload: { mood: "calm" } });
    expect(res.statusCode).toBe(400);
  });

  it("plan_tracklist (provisional) returns a contiguous tracklist", async () => {
    const res = await engine.app.inject({
      method: "POST",
      url: "/plan_tracklist",
      payload: { mode: "provisional", intent: { mood: "calm", scene: "studying" } },
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
      payload: { intent: { mood: "calm", scene: "studying" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ result: FlowResult; violations: unknown[]; candidates: TrackCandidate[] }>();
    expect(body.result.tracklist.length).toBeGreaterThan(0);
    expect(Array.isArray(body.violations)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);
  }, 10_000);

  it("GET /tracks/:id returns metadata, 404 for unknown", async () => {
    const ok = await engine.app.inject({ method: "GET", url: `/tracks/${firstTrackId}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<TrackMeta>().id).toBe(firstTrackId);

    const missing = await engine.app.inject({ method: "GET", url: "/tracks/does-not-exist" });
    expect(missing.statusCode).toBe(404);
  });
});
