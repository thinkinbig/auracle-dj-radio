import { describe, expect, it, vi } from "vitest";
import { ANONYMOUS_USER_ID, type Condition, type Energy, type FlowTrackRef, type TastePreference, type TrackCandidate, type TrackMeta } from "@auracle/shared";
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
import { editDistance, routeMoodScope } from "../src/session/mood-scope.js";
import { applyReplan, type OrchestrationDeps } from "../src/session/replan.js";
import { SessionStore } from "../src/session/store.js";

function candidate(id: string, energy: Energy): TrackCandidate {
  return { id, energy, tempo: 90 + energy * 5, genre: `g${id}`, mood: "calm", scene: "studying" };
}

class FakeMemoryService implements MemoryServiceClient {
  facts: { fact: string; userId: string }[] = [];
  events: { sessionId: string; userId: string; eventType: string; payload: unknown }[] = [];
  skipCalls: { userId: string; recentSessions: number }[] = [];
  recallIntentCalls: { userId: string; mood: string; scene: string }[] = [];
  /** Bearer token → user id; tokens absent here (and no token) resolve anonymous. */
  tokenToUser = new Map<string, string>();
  recallValue = "";
  skipWeights: Partial<Record<number, number>> = {};
  tasteValue: TastePreference[] = [];
  tasteCalls: string[] = [];
  async recall(): Promise<string> {
    return this.recallValue;
  }
  async tasteWeights(userId: string): Promise<TastePreference[]> {
    this.tasteCalls.push(userId);
    return this.tasteValue;
  }
  async recallForIntent(userId: string, mood: string, scene: string): Promise<string> {
    this.recallIntentCalls.push({ userId, mood, scene });
    return this.recallValue;
  }
  async remember(fact: string, _sessionId: string, userId: string): Promise<void> {
    this.facts.push({ fact, userId });
  }
  async recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): Promise<void> {
    this.events.push({ sessionId, userId, eventType, payload });
  }
  async skipRateByEnergy(userId: string, recentSessions: number): Promise<Partial<Record<number, number>>> {
    this.skipCalls.push({ userId, recentSessions });
    return this.skipWeights;
  }
  async resolveSessionUser(token?: string) {
    if (!token) return { kind: "anonymous" as const, userId: ANONYMOUS_USER_ID };
    const userId = this.tokenToUser.get(token);
    if (!userId) return { kind: "invalid_token" as const };
    return { kind: "authenticated" as const, userId };
  }
  countEvents(sessionId: string): number {
    return this.events.filter((e) => e.sessionId === sessionId).length;
  }
}

class FakeMusicEngine implements MusicEngineClient {
  planCalls: PlanTracklistRequest[] = [];
  searchCalls: SearchCatalogRequest[] = [];
  /** Optional tail tracks appended to the default full-plan set (E4 needs a longer queue). */
  extraTracks: TrackCandidate[] = [];
  fullGate?: Promise<void>;
  fullStarted = 0;
  async planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    this.planCalls.push(req);
    if (req.mode === "full") {
      this.fullStarted++;
      await this.fullGate;
    }
    if (req.mode === "extend") {
      const slots = req.extend?.appendSlots ?? 4;
      const candidates = Array.from({ length: slots }, (_, i) => candidate(`x${i + 1}`, ((i % 5) + 1) as Energy));
      const tracklist: FlowTrackRef[] = candidates.map((c, i) => ({ id: c.id, flow_position: i + 1, reason: "extend" }));
      return { result: { session_title: "", session_subtitle: "", arc: "peak", tracklist }, violations: [], candidates };
    }
    const candidates =
      req.mode === "replan"
        ? [candidate("d", 2), candidate("e", 4)]
        : [candidate("a", 3), candidate("b", 3), candidate("c", 5), candidate("f", 2), ...this.extraTracks];
    const tracklist: FlowTrackRef[] = candidates.map((c, i) => ({ id: c.id, flow_position: i + 1, reason: "fake" }));
    return {
      result: { session_title: "Fake Set, vol. 1", session_subtitle: "25 min · building", arc: "build", tracklist },
      violations: [],
      candidates,
    };
  }
  async searchCatalog(req: SearchCatalogRequest): Promise<{ candidates: TrackCandidate[] }> {
    this.searchCalls.push(req);
    // Fresh candidates not in the planned tracklist; s1 shares the skipped energy (3),
    // s2 differs (5) so the swap can prefer a different energy band.
    return { candidates: [candidate("s1", 3), candidate("s2", 5)] };
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
    expect(body.tracklist.map((t) => t.id)).toEqual(["a", "b", "c", "f"]);
    expect(body.proxy_url).toBe("http://proxy.test");
    expect(body.token).toBeTruthy();
    expect(music.planCalls[0]).toMatchObject({ mode: "provisional" });
    expect(memory.countEvents(body.session_id)).toBe(1);
    expect(proxy.calls.at(-1)?.reg.systemInstruction).toContain("Fake Set, vol. 1");
    await app.close();
  });

  it("does not wait for full copywriting before returning a playable session (P3.1)", async () => {
    const { app, music } = buildTestApp();
    let releaseFull!: () => void;
    music.fullGate = new Promise<void>((resolve) => {
      releaseFull = resolve;
    });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ tracklist: FlowTrackRef[] }>();
    expect(body.tracklist.map((t) => t.id)).toEqual(["a", "b", "c", "f"]);
    expect(music.planCalls[0]?.mode).toBe("provisional");
    expect(music.fullStarted).toBe(1);

    releaseFull();
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
    // Default mood_change is a nudge (E2): of remaining [b,c,f] only the next 2 slots
    // are re-filled (→ d,e); the tail "f" is kept. remainingSlots asked for is 2.
    expect(updated?.remaining.map((r) => r.id)).toEqual(["d", "e", "f"]);
    const replanCall = music.planCalls.find((c) => c.mode === "replan");
    expect(replanCall?.replan?.remainingSlots).toBe(2);
    expect(memory.facts.at(-1)?.fact).toContain("darker");
    await app.close();
  });

  it("regenerates the remaining queue on request", async () => {
    const { app, proxy, music, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    const res = await app.inject({ method: "POST", url: `/sessions/${session_id}/regenerate` });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ replanned: boolean; remaining: FlowTrackRef[]; tracklist: FlowTrackRef[] }>();
    expect(body.replanned).toBe(true);
    expect(body.remaining.map((r) => r.id)).toEqual(["d", "e"]);
    expect(body.tracklist.map((r) => r.id)).toEqual(["a", "d", "e"]);
    expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true);
    expect(memory.events.map((e) => e.eventType)).toContain("playlist_regenerate_requested");
    expect(proxy.injectCalls.at(-1)?.payload.ui_events?.some((e) => e.type === "tracklist_updated")).toBe(true);
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

  it("writes high-signal mem0 only after repeated quick skips at the same energy in condition C", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const { app, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying", condition: "C" } });
    const { session_id } = created.json<{ session_id: string }>();

    now.mockReturnValue(1_100);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "a" } });
    now.mockReturnValue(1_200);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(1_210);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });
    expect(memory.facts).toEqual([]);

    now.mockReturnValue(1_300);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(1_310);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "c" } });

    await vi.waitFor(() => expect(memory.facts).toHaveLength(1));
    expect(memory.facts[0]).toEqual({
      fact: 'User repeatedly skipped energy 3/5 tracks quickly during a "calm" studying session; prefer a different energy level for this context.',
      userId: ANONYMOUS_USER_ID,
    });
    now.mockRestore();
    await app.close();
  });

  it("does not write quick-skip mem0 for condition B", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(2_000);
    const { app, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying", condition: "B" } });
    const { session_id } = created.json<{ session_id: string }>();

    now.mockReturnValue(2_100);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "a" } });
    now.mockReturnValue(2_200);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(2_210);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });
    now.mockReturnValue(2_300);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(2_310);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "c" } });

    expect(memory.facts).toEqual([]);
    now.mockRestore();
    await app.close();
  });

  it("ignores a mood_change tool burst immediately after a plain skip", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const { app, music, proxy } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(1_100);
    const ignored = await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });

    expect(ignored.statusCode).toBe(200);
    expect(ignored.json<{ gemini_result: { ignored?: boolean; reason?: string } }>().gemini_result).toMatchObject({
      ignored: true,
      reason: "skip_only_guard",
    });
    expect(music.planCalls.some((c) => c.mode === "replan")).toBe(false);
    expect(proxy.injectCalls).toEqual([]);
    now.mockRestore();
    await app.close();
  });

  it("allows mood_change after the skip-only guard expires", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(2_000);
    const { app, music, proxy } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(4_000);
    await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });

    await vi.waitFor(() => expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true));
    expect(proxy.injectCalls.length).toBe(1);
    now.mockRestore();
    await app.close();
  });

  it("binds an unauthenticated session to the anonymous user (P0-1)", async () => {
    const { app, memory } = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = res.json<{ session_id: string }>();
    expect(memory.events.find((e) => e.sessionId === session_id)?.userId).toBe(ANONYMOUS_USER_ID);
    await app.close();
  });

  it("resolves the Bearer token to the authed user and aggregates skips per user (P0-1/P0-3)", async () => {
    const { app, memory } = buildTestApp();
    memory.tokenToUser.set("tok-1", "user-1");
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { authorization: "Bearer tok-1" },
      payload: { mood: "calm", scene: "studying" },
    });
    const { session_id } = res.json<{ session_id: string }>();
    expect(memory.events.find((e) => e.sessionId === session_id)?.userId).toBe("user-1");
    expect(memory.skipCalls).toEqual([{ userId: "user-1", recentSessions: 10 }]);
    await app.close();
  });

  it("rejects an invalid Bearer token with 401 (P0-7)", async () => {
    const { app, memory } = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { authorization: "Bearer bad-token" },
      payload: { mood: "calm", scene: "studying" },
    });
    expect(res.statusCode).toBe(401);
    expect(memory.events).toHaveLength(0);
    await app.close();
  });

  it("condition B uses no skip weights or mem0 recall (P0-4)", async () => {
    const { app, memory, music } = buildTestApp();
    memory.recallValue = "prefers lighter energy";
    memory.skipWeights = { 5: 0.3 };
    await app.ready();
    memory.tasteValue = [{ entityType: "genre", entityId: "house", polarity: "avoid", source: "onboarding" }];
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying", condition: "B" } });
    expect(created.json<{ mem0_context: string }>().mem0_context).toBe("");
    expect(memory.skipCalls).toEqual([]);
    expect(memory.tasteCalls).toEqual([]);
    expect(memory.recallIntentCalls).toEqual([]);
    expect(music.planCalls[0]?.memories).toBe("");
    expect(music.planCalls[0]?.energyWeights).toBeUndefined();
    expect(music.planCalls[0]?.taste).toBeUndefined();
    await app.close();
  });

  it("condition C loads structured taste and passes it into plan + replan (S4)", async () => {
    const { app, memory, music } = buildTestApp();
    memory.recallValue = "prefers lighter energy";
    memory.skipWeights = { 5: 0.3 };
    const taste: TastePreference[] = [{ entityType: "genre", entityId: "house", polarity: "avoid", source: "onboarding", strength: 3 }];
    memory.tasteValue = taste;
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "C" },
    });
    const { session_id, mem0_context } = created.json<{ session_id: string; mem0_context: string }>();
    expect(mem0_context).toBe("prefers lighter energy");
    expect(memory.recallIntentCalls).toEqual([{ userId: ANONYMOUS_USER_ID, mood: "calm", scene: "studying" }]);
    expect(music.planCalls[0]).toMatchObject({ memories: "prefers lighter energy", energyWeights: { 5: 0.3 }, taste });

    await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });
    await vi.waitFor(() => expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true));
    const replan = music.planCalls.find((c) => c.mode === "replan");
    // taste is refreshed on each replan from memory-service, so changes mid-session are reflected.
    expect(replan?.taste).toEqual(taste);
    // verify that taste was re-fetched (tasteWeights called again for replan).
    expect(memory.tasteCalls.length).toBeGreaterThan(1);
    await app.close();
  });

  it("swaps the next track deterministically after repeated same-energy quick skips, no Flow LLM (E4)", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const { app, memory, music, proxy } = buildTestApp();
    // Longer queue so rolling extend (E1) does not fire while exercising skip-swap.
    music.extraTracks = [candidate("g", 3), candidate("h", 4)];
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "C" },
    });
    const { session_id } = created.json<{ session_id: string }>();

    // tracklist is a(3), b(3), c(5), f(2), g(3), h(4). Quick-skip a then b — two skips at energy 3.
    now.mockReturnValue(1_100);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "a" } });
    now.mockReturnValue(1_200);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(1_210); // listened 110ms < 60s → quick skip #1 (energy 3, no swap yet)
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });
    expect(proxy.injectCalls).toEqual([]); // below threshold: no swap on the first quick skip

    now.mockReturnValue(1_300);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(1_310); // quick skip #2 at energy 3 → threshold → swap remaining[0] ("f")
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "c" } });

    await vi.waitFor(() => expect(proxy.injectCalls.length).toBeGreaterThan(0));
    const updated = proxy.injectCalls.at(-1)!.payload.ui_events?.find((e) => e.type === "tracklist_updated") as
      | { remaining: { id: string }[]; changed_ids?: string[] }
      | undefined;
    expect(updated).toBeTruthy();
    expect(updated!.remaining.map((r) => r.id)).toEqual(["s2", "g", "h"]); // s2(5) preferred over s1(3 = skipped energy)
    expect(updated!.changed_ids).toEqual(["s2"]); // "f" swapped out
    // deterministic: search_catalog only, never a Flow plan/replan beyond the initial full plan.
    expect(music.searchCalls).toHaveLength(1);
    expect(music.planCalls.filter((c) => c.mode !== "provisional" && c.mode !== "full")).toEqual([]);
    await vi.waitFor(() => expect(memory.events.map((e) => e.eventType)).toContain("skip_queue_adjusted"));
    now.mockRestore();
    await app.close();
  });

  it("does not swap the queue on repeated quick skips in condition A (ablation)", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(5_000);
    const { app, music, proxy } = buildTestApp();
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "A" },
    });
    const { session_id } = created.json<{ session_id: string }>();

    now.mockReturnValue(5_100);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "a" } });
    now.mockReturnValue(5_200);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(5_210);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });
    now.mockReturnValue(5_300);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/tool`, payload: { name: "skip_track" } });
    now.mockReturnValue(5_310);
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "c" } });

    expect(music.searchCalls).toEqual([]);
    expect(proxy.injectCalls).toEqual([]);
    now.mockRestore();
    await app.close();
  });

  it("rolling-extends the queue when remaining drops to the threshold (E1)", async () => {
    const { app, memory, music, proxy } = buildTestApp();
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "C" },
    });
    const { session_id } = created.json<{ session_id: string }>();

    // tracklist is a,b,c,f; playing "b" leaves remaining [c,f] (== threshold 2) → extend.
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });

    await vi.waitFor(() => expect(music.planCalls.some((c) => c.mode === "extend")).toBe(true));
    const extendCall = music.planCalls.find((c) => c.mode === "extend");
    expect(extendCall?.extend?.appendSlots).toBe(4);
    // excludes everything already queued (played + current + remaining).
    expect(extendCall?.extend?.playedIds).toEqual(["a", "b", "c", "f"]);

    await vi.waitFor(() => expect(proxy.injectCalls.length).toBeGreaterThan(0));
    const updated = proxy.injectCalls.at(-1)!.payload.ui_events?.find((e) => e.type === "tracklist_updated") as
      | { remaining: { id: string }[] }
      | undefined;
    expect(updated!.remaining.map((r) => r.id)).toEqual(["c", "f", "x1", "x2", "x3", "x4"]);

    await vi.waitFor(() => expect(memory.events.some((e) => e.eventType === "queue_extended")).toBe(true));
    const ext = memory.events.find((e) => e.eventType === "queue_extended")!;
    expect(ext.payload).toMatchObject({ before_count: 2, after_count: 6 });

    // Debounce: advancing into the now-long queue does not trigger another extend.
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "c" } });
    expect(music.planCalls.filter((c) => c.mode === "extend")).toHaveLength(1);
    await app.close();
  });

  it("does not rolling-extend in condition A (ablation)", async () => {
    const { app, music, proxy } = buildTestApp();
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "A" },
    });
    const { session_id } = created.json<{ session_id: string }>();

    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "a" } });
    await app.inject({ method: "POST", url: `/sessions/${session_id}/now_playing`, payload: { track_id: "b" } });

    expect(music.planCalls.some((c) => c.mode === "extend")).toBe(false);
    expect(proxy.injectCalls).toEqual([]);
    await app.close();
  });

  it("condition B replan carries no memories or weights (P0-5/P0-6)", async () => {
    const { app, music } = buildTestApp();
    await app.ready();
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mood: "calm", scene: "studying", condition: "B" },
    });
    const { session_id } = created.json<{ session_id: string }>();
    await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "darker", energy_delta: "heavier" } },
    });
    await vi.waitFor(() => expect(music.planCalls.some((c) => c.mode === "replan")).toBe(true));
    const replan = music.planCalls.find((c) => c.mode === "replan");
    expect(replan?.memories).toBe("");
    expect(replan?.energyWeights).toBeUndefined();
    expect(replan?.taste).toBeUndefined();
    await app.close();
  });
});

/**
 * Configurable replan engine for the nudge unit tests: returns exactly the
 * requested `remainingSlots` fresh tracks (n1..nN), each at the requested
 * `lastPlayedEnergy` so energy direction is observable.
 */
class NudgeMusicEngine implements MusicEngineClient {
  planCalls: PlanTracklistRequest[] = [];
  async planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    this.planCalls.push(req);
    const n = req.replan?.remainingSlots ?? 0;
    const energy = Math.min(5, Math.max(1, req.replan?.lastPlayedEnergy ?? 3)) as Energy;
    const candidates = Array.from({ length: n }, (_, i) => candidate(`n${i + 1}`, energy));
    const tracklist: FlowTrackRef[] = candidates.map((c, i) => ({ id: c.id, flow_position: i + 1, reason: "replan" }));
    return { result: { session_title: "", session_subtitle: "", arc: "build", tracklist }, violations: [], candidates };
  }
  async searchCatalog(): Promise<{ candidates: TrackCandidate[] }> {
    return { candidates: [] };
  }
  async getTrack(): Promise<TrackMeta | undefined> {
    return undefined;
  }
}

describe("applyReplan scopes (E2 mood_change nudge)", () => {
  // tracklist t1(1) t2(2) t3(3) t4(4) t5(5); current = t1 unless markStarted moves it.
  function makeSession(store: SessionStore, condition: Condition = "C") {
    const tracklist: FlowTrackRef[] = ["t1", "t2", "t3", "t4", "t5"].map((id, i) => ({
      id,
      flow_position: i + 1,
      reason: "seed",
    }));
    const candidatesById = new Map(tracklist.map((r, i) => [r.id, candidate(r.id, (i + 1) as Energy)]));
    return store.create({
      userId: ANONYMOUS_USER_ID,
      intent: { mood: "calm", scene: "studying", duration_min: 25 },
      condition,
      title: "T",
      subtitle: "S",
      arc: "build",
      tracklist,
      candidatesById,
      mem0Context: "",
    });
  }

  function makeDeps(store: SessionStore, music: MusicEngineClient): { deps: OrchestrationDeps; memory: FakeMemoryService; proxy: FakeProxyClient } {
    const memory = new FakeMemoryService();
    const proxy = new FakeProxyClient();
    return { deps: { store, memory, music, proxy }, memory, proxy };
  }

  it("nudge (default) re-fills only the next 1–2 slots and keeps the tail", async () => {
    const store = new SessionStore();
    const state = makeSession(store);
    const music = new NudgeMusicEngine();
    const { deps } = makeDeps(store, music);

    const outcome = await applyReplan(deps, state, { mood: "darker", energy_delta: "same" });

    expect(outcome.replanned).toBe(true);
    // remaining was [t2,t3,t4,t5]; only the next 2 (t2,t3) are replaced, tail (t4,t5) kept.
    expect(state.tracklist.map((r) => r.id)).toEqual(["t1", "n1", "n2", "t4", "t5"]);
    expect(outcome.remaining.map((r) => r.id)).toEqual(["n1", "n2", "t4", "t5"]);
    // exactly two ids changed.
    expect(music.planCalls[0]?.replan?.remainingSlots).toBe(2);
    // exclude set covers played/current AND the kept tail, never the replaced slots.
    expect(music.planCalls[0]?.replan?.playedIds).toEqual(["t1", "t4", "t5"]);
    // flow_position stays contiguous after the surgery.
    state.tracklist.forEach((r, i) => expect(r.flow_position).toBe(i + 1));
  });

  it("scope:full replaces the whole remaining queue (Regenerate path)", async () => {
    const store = new SessionStore();
    const state = makeSession(store);
    const music = new NudgeMusicEngine();
    const { deps } = makeDeps(store, music);

    const outcome = await applyReplan(deps, state, { mood: "darker", energy_delta: "same", scope: "full" });

    expect(music.planCalls[0]?.replan?.remainingSlots).toBe(4);
    expect(state.tracklist.map((r) => r.id)).toEqual(["t1", "n1", "n2", "n3", "n4"]);
    expect(outcome.remaining.map((r) => r.id)).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("records scope:\"nudge\" in the replan event", async () => {
    const store = new SessionStore();
    const state = makeSession(store);
    const { deps, memory } = makeDeps(store, new NudgeMusicEngine());

    await applyReplan(deps, state, { mood: "darker" });

    const ev = memory.events.find((e) => e.eventType === "replan");
    expect(ev?.payload).toMatchObject({ scope: "nudge" });
  });

  it("nudge moves the next track's energy in the requested direction", async () => {
    const store = new SessionStore();
    // current = t3 (energy 3) for both; heavier → seed 4, lighter → seed 2.
    const heavier = makeSession(store);
    store.markStarted(heavier, "t3");
    const heavierMusic = new NudgeMusicEngine();
    await applyReplan(makeDeps(store, heavierMusic).deps, heavier, { mood: "x", energy_delta: "heavier" });

    const lighter = makeSession(store);
    store.markStarted(lighter, "t3");
    const lighterMusic = new NudgeMusicEngine();
    await applyReplan(makeDeps(store, lighterMusic).deps, lighter, { mood: "x", energy_delta: "lighter" });

    const nextEnergy = (s: typeof heavier) => s.energyById.get(s.tracklist[s.currentTrackIndex + 1]!.id)!;
    expect(nextEnergy(heavier)).toBeGreaterThan(nextEnergy(lighter));
    expect(heavierMusic.planCalls[0]?.replan?.lastPlayedEnergy).toBe(4);
    expect(lighterMusic.planCalls[0]?.replan?.lastPlayedEnergy).toBe(2);
  });

  it("is a noop in condition A (ablation)", async () => {
    const store = new SessionStore();
    const state = makeSession(store, "A");
    const music = new NudgeMusicEngine();
    const { deps, proxy } = makeDeps(store, music);

    const outcome = await applyReplan(deps, state, { mood: "darker" });

    expect(outcome.replanned).toBe(false);
    expect(music.planCalls).toEqual([]);
    expect(proxy.injectCalls).toEqual([]);
    expect(state.tracklist.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("is a noop when nothing is left to play", async () => {
    const store = new SessionStore();
    const state = makeSession(store);
    store.markStarted(state, "t5"); // current = last slot → remaining empty
    const music = new NudgeMusicEngine();
    const { deps } = makeDeps(store, music);

    const outcome = await applyReplan(deps, state, { mood: "darker" });

    expect(outcome.replanned).toBe(false);
    expect(music.planCalls).toEqual([]);
  });

  it("scope:steer re-fills the latter half and keeps the head (E5)", async () => {
    const store = new SessionStore();
    const state = makeSession(store); // current t1; remaining [t2,t3,t4,t5]
    const music = new NudgeMusicEngine();
    const { deps } = makeDeps(store, music);

    const outcome = await applyReplan(deps, state, { mood: "energetic", energy_delta: "same", scope: "steer" });

    // remaining 4 → ceil(4/2)=2 replaced from the tail; head [t2,t3] preserved.
    expect(state.tracklist.map((r) => r.id)).toEqual(["t1", "t2", "t3", "n1", "n2"]);
    expect(outcome.remaining.map((r) => r.id)).toEqual(["t2", "t3", "n1", "n2"]);
    expect(music.planCalls[0]?.replan?.remainingSlots).toBe(2);
    // exclude set keeps played/current + the kept head; only t4,t5 are up for replacement.
    expect(music.planCalls[0]?.replan?.playedIds).toEqual(["t1", "t2", "t3"]);
    // chain seeds from the slot just before the window (t3, energy 3), not the current track.
    expect(music.planCalls[0]?.replan?.lastPlayedEnergy).toBe(3);
    state.tracklist.forEach((r, i) => expect(r.flow_position).toBe(i + 1));
  });
});

describe("routeMoodScope (E5 intent tiers)", () => {
  it("an energy-only tweak is always a nudge, even with a different mood word", () => {
    expect(routeMoodScope("calm", "energetic", "heavier")).toBe("nudge");
    expect(routeMoodScope("calm", "energetic", "lighter")).toBe("nudge");
  });

  it("an unchanged or lightly-inflected mood stays a nudge", () => {
    expect(routeMoodScope("calm", "calm", "same")).toBe("nudge");
    expect(routeMoodScope("calm", "calmer", "same")).toBe("nudge"); // inflection
    expect(routeMoodScope("chill", "chilled", undefined)).toBe("nudge"); // substring
  });

  it("a significantly different mood escalates to steer", () => {
    expect(routeMoodScope("calm", "energetic", "same")).toBe("steer");
    expect(routeMoodScope("calm", "darker", "same")).toBe("steer");
    expect(routeMoodScope("happy", "melancholic", "same")).toBe("steer");
  });

  it("editDistance is symmetric and zero on equal strings", () => {
    expect(editDistance("calm", "calm")).toBe(0);
    expect(editDistance("calm", "calmer")).toBe(editDistance("calmer", "calm"));
  });
});

describe("mood_change routing end-to-end (E5)", () => {
  it("routes a significant mood change to steer and keeps the head of the queue", async () => {
    const { app, memory } = buildTestApp();
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { mood: "calm", scene: "studying" } });
    const { session_id } = created.json<{ session_id: string }>();

    // created tracklist a,b,c,f; current a; remaining [b,c,f]. "energetic" ≫ "calm" → steer.
    await app.inject({
      method: "POST",
      url: `/sessions/${session_id}/tool`,
      payload: { name: "mood_change", args: { mood: "energetic", energy_delta: "same" } },
    });

    await vi.waitFor(() => expect(memory.events.some((e) => e.eventType === "replan")).toBe(true));
    const ev = memory.events.find((e) => e.eventType === "replan")!;
    expect(ev.payload).toMatchObject({ scope: "steer" });
    // steer keeps the head ("b") and re-fills the latter half (c,f → d,e).
    expect((ev.payload as { after: string[] }).after).toEqual(["b", "d", "e"]);
    await app.close();
  });
});
