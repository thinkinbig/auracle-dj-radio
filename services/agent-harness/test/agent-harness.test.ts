import { describe, expect, it, vi } from "vitest";
import type { Energy, FlowTrackRef, TrackCandidate, TrackMeta } from "@auracle/shared";
import type { MemoryServiceClient } from "../src/memory-service-client.js";
import type {
  MusicEngineClient,
  PlanResponse,
  PlanTracklistRequest,
  SearchCatalogRequest,
} from "../src/music-engine-client.js";
import type { InjectPayload, ProxyClient } from "../src/proxy-client.js";
import type { Registration } from "../src/dj/registration.js";
import { buildServer } from "../src/server.js";
import { SessionStore } from "../src/session/store.js";

function candidate(id: string, energy: Energy): TrackCandidate {
  return { id, energy, tempo: 90 + energy * 5, genre: `g${id}`, mood: "calm", scene: "studying" };
}

class FakeMemoryService implements MemoryServiceClient {
  facts: string[] = [];
  events: { sessionId: string; eventType: string; payload: unknown }[] = [];
  async recall(): Promise<string> {
    return "";
  }
  async remember(fact: string): Promise<void> {
    this.facts.push(fact);
  }
  async recordEvent(sessionId: string, eventType: string, payload: unknown): Promise<void> {
    this.events.push({ sessionId, eventType, payload });
  }
  async skipRateByEnergy(): Promise<Partial<Record<number, number>>> {
    return {};
  }
  countEvents(sessionId: string): number {
    return this.events.filter((e) => e.sessionId === sessionId).length;
  }
}

class FakeMusicEngine implements MusicEngineClient {
  planCalls: PlanTracklistRequest[] = [];
  async planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    this.planCalls.push(req);
    const candidates =
      req.mode === "replan"
        ? [candidate("d", 2), candidate("e", 4)]
        : [candidate("a", 1), candidate("b", 3), candidate("c", 5)];
    const tracklist: FlowTrackRef[] = candidates.map((c, i) => ({ id: c.id, flow_position: i + 1, reason: "fake" }));
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

class FakeProxyClient implements ProxyClient {
  calls: { sessionId: string; token: string; reg: Registration }[] = [];
  injectCalls: { sessionId: string; payload: InjectPayload }[] = [];
  async register(sessionId: string, token: string, reg: Registration): Promise<void> {
    this.calls.push({ sessionId, token, reg });
  }
  async inject(sessionId: string, payload: InjectPayload): Promise<void> {
    this.injectCalls.push({ sessionId, payload });
  }
}

function buildTestApp() {
  const memory = new FakeMemoryService();
  const music = new FakeMusicEngine();
  const proxy = new FakeProxyClient();
  const app = buildServer({
    store: new SessionStore(),
    memory,
    music,
    proxy,
    proxyPublicUrl: "http://proxy.test",
  });
  return { app, memory, music, proxy };
}

describe("agent-harness", () => {
  it("creates sessions, registers the proxy contract, and records lifecycle events", async () => {
    const { app, memory, music, proxy } = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ session_id: string; tracklist: FlowTrackRef[]; proxy_url: string; token: string }>();
    expect(body.tracklist.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(body.proxy_url).toBe("http://proxy.test");
    expect(body.token).toBeTruthy();
    expect(music.planCalls[0]).toMatchObject({ mode: "full" });
    expect(memory.countEvents(body.session_id)).toBe(1);
    expect(proxy.calls.at(-1)?.reg.systemInstruction).toContain("Fake Set, vol. 1");
    await app.close();
  });

  it("runs mood_change replan in the background and pushes the new remaining list", async () => {
    const { app, proxy, music, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ ui_events: { type: string }[] }>().ui_events.some((e) => e.type === "intent")).toBe(true);

    await vi.waitFor(() => expect(proxy.injectCalls.length).toBe(1));
    const updated = proxy.injectCalls[0]!.payload.ui_events?.find((e) => e.type === "tracklist_updated") as
      | { remaining: { id: string }[] }
      | undefined;
    expect(updated?.remaining.map((r) => r.id)).toEqual(["d", "e"]);
    expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true);
    expect(memory.facts.at(-1)).toContain("darker");
    await app.close();
  });

  it("mirrors now_playing and records skip latency through memory-service", async () => {
    const { app, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    const res = await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ current_track_index: number }>().current_track_index).toBe(1);
    expect(memory.events.map((e) => e.eventType)).toContain("skip_latency");
    await app.close();
  });
});
