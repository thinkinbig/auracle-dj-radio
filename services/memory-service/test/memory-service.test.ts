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

/** Canned music-engine: full → a,b,c; replan → d,e (distinct so replan is visible). */
class FakeMusicEngine implements MusicEngineClient {
  planCalls: PlanTracklistRequest[] = [];
  async planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    this.planCalls.push(req);
    const candidates =
      req.mode === "replan"
        ? [candidate("d", 2), candidate("e", 4)]
        : [candidate("a", 1), candidate("b", 3), candidate("c", 5)];
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

/** Records remember() calls so condition-C writes are assertable; recall stays empty. */
class RecordingMemory implements MemoryClient {
  readonly enabled = true;
  readonly degraded = false;
  facts: string[] = [];
  async recall(): Promise<string> {
    return "";
  }
  async remember(fact: string): Promise<void> {
    this.facts.push(fact);
  }
}

let app: ReturnType<typeof buildServer>;
let events: EventsDb;
let music: FakeMusicEngine;
let memory: RecordingMemory;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "memory-service-")), "events.sqlite");
  events = new EventsDb(dbPath);
  music = new FakeMusicEngine();
  memory = new RecordingMemory();
  app = buildServer({ store: new SessionStore(), events, music, memory });
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

describe("memory-service orchestration", () => {
  async function createSession(condition = "C"): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition },
    });
    return res.json<{ session_id: string }>().session_id;
  }

  it("change_host_mode updates state and returns the Lane-1 envelope", async () => {
    const id = await createSession();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${id}/tool`,
      payload: { name: "change_host_mode", args: { host_mode: "hype" } },
    });
    expect(res.statusCode).toBe(200);
    const env = res.json<{ gemini_result: { host_mode: string; changed: boolean }; ui_events: { type: string; intent: { type: string; host_mode: string } }[] }>();
    expect(env.gemini_result).toMatchObject({ host_mode: "hype", changed: true });
    expect(env.ui_events[0]).toMatchObject({ type: "intent", intent: { type: "host_mode_changed", host_mode: "hype" } });

    const snap = await app.inject({ method: "GET", url: `/sessions/${id}` });
    expect(snap.json<{ host_mode: string }>().host_mode).toBe("hype");
  });

  it("mood_change replans remaining slots via music-engine and writes a C preference", async () => {
    const id = await createSession("C");
    const before = memory.facts.length;
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });
    expect(res.statusCode).toBe(200);
    const env = res.json<{ gemini_result: { ok: boolean }; ui_events: { type: string; remaining?: { id: string }[] }[] }>();
    expect(env.gemini_result.ok).toBe(true);
    const updated = env.ui_events.find((e) => e.type === "tracklist_updated");
    expect(updated?.remaining?.map((r) => r.id)).toEqual(["d", "e"]);
    expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true);
    expect(memory.facts.length).toBe(before + 1);
    expect(memory.facts.at(-1)).toContain("darker");
  });

  it("condition A pins the playlist (mood_change does not replan)", async () => {
    const id = await createSession("A");
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker" } },
    });
    const env = res.json<{ ui_events: { type: string }[] }>();
    expect(env.ui_events.some((e) => e.type === "tracklist_updated")).toBe(false);
  });

  it("record_preference persists only for condition C", async () => {
    const idC = await createSession("C");
    const beforeC = memory.facts.length;
    await app.inject({ method: "POST", url: `/sessions/${idC}/tool`, payload: { name: "record_preference", args: { fact: "loves vinyl crackle" } } });
    expect(memory.facts.length).toBe(beforeC + 1);

    const idB = await createSession("B");
    const beforeB = memory.facts.length;
    await app.inject({ method: "POST", url: `/sessions/${idB}/tool`, payload: { name: "record_preference", args: { fact: "ignored" } } });
    expect(memory.facts.length).toBe(beforeB);
  });

  it("now_playing mirrors the playhead and times the skip round trip", async () => {
    const id = await createSession("C");
    expect(events.countEvents(id)).toBe(1); // session_created

    await app.inject({ method: "POST", url: `/sessions/${id}/tool`, payload: { name: "skip_track" } });
    expect(events.countEvents(id)).toBe(2); // + skip_track

    const res = await app.inject({ method: "POST", url: `/sessions/${id}/now_playing`, payload: { track_id: "b" } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ current_track_index: number }>().current_track_index).toBe(1);
    expect(events.countEvents(id)).toBe(3); // + skip_latency

    const unknown = await app.inject({ method: "POST", url: `/sessions/${id}/now_playing`, payload: { track_id: "zzz" } });
    expect(unknown.statusCode).toBe(400);
  });

  it("rejects unknown tools and missing sessions", async () => {
    const id = await createSession("C");
    const unknown = await app.inject({ method: "POST", url: `/sessions/${id}/tool`, payload: { name: "frobnicate" } });
    expect(unknown.json<{ gemini_result: { ok: boolean } }>().gemini_result.ok).toBe(false);

    const missing = await app.inject({ method: "POST", url: "/sessions/nope/tool", payload: { name: "skip_track" } });
    expect(missing.statusCode).toBe(404);
  });
});
