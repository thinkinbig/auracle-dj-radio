import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Energy, FlowTrackRef, TrackCandidate, TrackMeta } from "@auracle/shared";
import { EventsDb } from "../src/events-db.js";
import { SessionStore } from "../src/session/store.js";
import type {
  MusicEngineClient,
  PlanResponse,
  PlanTracklistRequest,
  SearchCatalogRequest,
} from "../src/music-engine-client.js";
import type { MemoryClient } from "../src/memory/client.js";
import { buildServer } from "../src/server.js";

function candidate(id: string, energy: Energy): TrackCandidate {
  return { id, energy, tempo: 90 + energy * 5, genre: `g${id}`, mood: "calm", scene: "studying" };
}

/** Canned music-engine: a fixed 3-track plan, regardless of request. */
class FakeMusicEngine implements MusicEngineClient {
  planCalls: PlanTracklistRequest[] = [];
  async planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    this.planCalls.push(req);
    const candidates = [candidate("a", 1), candidate("b", 3), candidate("c", 5)];
    const tracklist: FlowTrackRef[] = candidates.map((c, i) => ({
      id: c.id,
      flow_position: i + 1,
      reason: "fake",
    }));
    return {
      result: { session_title: "Fake Set, vol. 1", session_subtitle: "25 min · building", arc: "build", tracklist },
      violations: [],
      candidates,
    };
  }
  async searchCatalog(_req: SearchCatalogRequest): Promise<{ candidates: TrackCandidate[] }> {
    return { candidates: [candidate("a", 1)] };
  }
  async getTrack(id: string): Promise<TrackMeta | undefined> {
    if (id !== "a") return undefined;
    return {
      id: "a",
      title: "Opening Track",
      artist: "Test Artist",
      artistId: "ar1",
      albumId: "al1",
      albumTitle: "Test Album",
      albumCoverUrl: "/covers/a.jpg",
      artistPhotoUrl: "/artists/ar1.jpg",
      lore: "A gentle opener.",
      energy: 1,
      tempo: 70,
      genre: "ambient",
      mood: "calm",
      scene: "studying",
      filePath: "data/audio/a.mp3",
      introOffsetMs: null,
    };
  }
}

/** No cross-session memory in tests — keep them hermetic (no Gemini/Qdrant). */
const noopMemory: MemoryClient = {
  enabled: false,
  degraded: false,
  async recall() {
    return "";
  },
  async remember() {},
};

let app: ReturnType<typeof buildServer>;
let events: EventsDb;
let music: FakeMusicEngine;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "memory-service-")), "events.sqlite");
  events = new EventsDb(dbPath);
  music = new FakeMusicEngine();
  app = buildServer({ store: new SessionStore(), events, music, memory: noopMemory });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  events.close();
});

describe("memory-service /sessions", () => {
  it("creates a session sourced from music-engine and logs session_created", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "C" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ session_id: string; tracklist: FlowTrackRef[]; host_mode: string }>();
    expect(body.tracklist.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(body.host_mode).toBeTruthy();
    expect(music.planCalls).toHaveLength(1);
    expect(events.countEvents(body.session_id)).toBe(1);
  });

  it("rejects a session missing mood/scene", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns a session snapshot, 404 for unknown", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying" },
    });
    const { session_id } = created.json<{ session_id: string }>();

    const snap = await app.inject({ method: "GET", url: `/sessions/${session_id}` });
    expect(snap.statusCode).toBe(200);
    const body = snap.json<{ current_track_index: number; remaining: FlowTrackRef[] }>();
    expect(body.current_track_index).toBe(0);
    expect(body.remaining.map((t) => t.id)).toEqual(["b", "c"]);

    const missing = await app.inject({ method: "GET", url: "/sessions/nope" });
    expect(missing.statusCode).toBe(404);
  });

  it("serves a pre-baked registration contract, 404 for unknown", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying" },
    });
    const { session_id, session_title } = created.json<{ session_id: string; session_title: string }>();

    const res = await app.inject({ method: "GET", url: `/sessions/${session_id}/registration` });
    expect(res.statusCode).toBe(200);
    const reg = res.json<{ systemInstruction: string; tools: { name: string }[]; openingCue: string }>();
    expect(reg.systemInstruction).toContain(session_title);
    expect(reg.tools.map((t) => t.name)).toEqual([
      "skip_track",
      "mood_change",
      "change_host_mode",
      "pause_playback",
      "record_preference",
    ]);
    expect(reg.openingCue).toContain("[opening");
    expect(reg.openingCue).toContain("Opening Track");

    const missing = await app.inject({ method: "GET", url: "/sessions/nope/registration" });
    expect(missing.statusCode).toBe(404);
  });
});
