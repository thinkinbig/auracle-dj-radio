import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID, type CatalogManifest, type TasteProfileResponse } from "@auracle/shared";
import { AuthStore } from "../src/auth-store.js";
import { buildCatalogIndex, type CatalogIndex } from "../src/catalog-index.js";
import { EventsDb } from "../src/events-db.js";
import type { MemoryClient } from "../src/memory/client.js";
import { TasteStore } from "../src/taste/taste-store.js";
import { buildServer } from "../src/server.js";

/** Deterministic test catalog (independent of the seeded 16-track manifest). */
function testManifest(artistId = "a-lana-delay"): CatalogManifest {
  return {
    artists: [{ id: artistId, name: "Lana Delay", slug: "lana-del-delay" }],
    albums: [{ id: "alb-lana-delay-midnight", title: "Born to Delay", slug: "lana-del-delay/born-to-delay", artistId }],
    // t01 has the full album/genre join (session-feedback rollups); t02 is bare.
    tracks: [{ id: "t01", albumId: "alb-lana-delay-midnight", title: "Neon Rain", genreSlug: "lo-fi" }, { id: "t02" }],
  } as unknown as CatalogManifest;
}

function testCatalog(artistId?: string, revision = "test-rev-001"): CatalogIndex {
  return buildCatalogIndex(
    testManifest(artistId),
    { genres: [{ slug: "lo-fi", label: "Lo-Fi" }, { slug: "house", label: "House" }], mapping: {} },
    revision,
  );
}

class RecordingMemory implements MemoryClient {
  readonly enabled = true;
  readonly degraded = false;
  facts: { fact: string; sessionId: string; userId: string }[] = [];
  recalls: { query: string; userId: string }[] = [];
  async recall(query: string, userId: string): Promise<string> {
    this.recalls.push({ query, userId });
    return this.memoriesFor(query);
  }
  async recallForIntent(userId: string, mood: string, scene: string): Promise<string> {
    const queries = [`music preferences for a ${mood} ${scene} session`, `music preferences for ${scene} sessions`];
    const facts = queries.flatMap((query) => {
      this.recalls.push({ query, userId });
      return this.memoriesFor(query).split("\n").map((line) => line.replace(/^- /, "")).filter(Boolean);
    });
    return [...new Set(facts)].map((fact) => `- ${fact}`).join("\n");
  }
  private memoriesFor(query: string): string {
    if (query.includes("calm studying")) return "- prefers lighter energy\n- likes sparse piano";
    if (query.includes("studying sessions")) return "- likes sparse piano\n- dislikes harsh drums";
    return "";
  }
  async remember(fact: string, sessionId: string, userId: string): Promise<void> {
    this.facts.push({ fact, sessionId, userId });
  }
  async forget(sessionId: string, userId: string): Promise<void> {
    this.facts = this.facts.filter((f) => !(f.sessionId === sessionId && f.userId === userId));
  }
}

let app: ReturnType<typeof buildServer>;
let events: EventsDb;
let auth: AuthStore;
let memory: RecordingMemory;
let taste: TasteStore;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "memory-service-")), "events.sqlite");
  const authDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-auth-")), "auth.sqlite");
  const tasteDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-taste-")), "taste.sqlite");
  events = new EventsDb(dbPath);
  auth = new AuthStore(authDbPath);
  taste = new TasteStore(tasteDbPath);
  memory = new RecordingMemory();
  app = buildServer({ events, memory, auth, taste, catalog: testCatalog() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  events.close();
  auth.close();
  taste.close();
});

/** Register a fresh user and return its id + bearer token. */
async function registerUser(email: string): Promise<{ id: string; token: string }> {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "secret123" } });
  const body = res.json<{ user: { id: string }; token: string }>();
  return { id: body.user.id, token: body.token };
}

describe("memory-service /auth", () => {
  it("registers, restores the current user, rejects duplicate email, and logs out", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "Listener@Example.com", password: "secret123", name: "Listener" },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json<{ user: { email: string; name: string }; token: string }>();
    expect(body.user.email).toBe("listener@example.com");
    expect(body.user.name).toBe("Listener");
    expect(body.token).toBeTruthy();

    const duplicate = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "listener@example.com", password: "secret123" },
    });
    expect(duplicate.statusCode).toBe(409);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { email: string } }>().user.email).toBe("listener@example.com");

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("logs in an existing user and rejects a bad password", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "login@example.com", password: "secret123" },
    });

    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "login@example.com", password: "wrong123" },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "login@example.com", password: "secret123" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ token: string }>().token).toBeTruthy();
  });
});

describe("memory-service internal memory/events API", () => {
  it("exposes recall, remember, recordEvent, and skipRateByEnergy for agent-harness", async () => {
    const recall = await app.inject({
      method: "POST",
      url: "/memory/recall",
      payload: { query: "calm studying", user_id: ANONYMOUS_USER_ID },
    });
    expect(recall.statusCode).toBe(200);
    expect(recall.json<{ memories: string }>().memories).toBe("- prefers lighter energy\n- likes sparse piano");

    const beforeFacts = memory.facts.length;
    const intentRecall = await app.inject({
      method: "POST",
      url: "/memory/recall-intent",
      payload: { mood: "calm", scene: "studying", user_id: ANONYMOUS_USER_ID },
    });
    expect(intentRecall.statusCode).toBe(200);
    expect(intentRecall.json<{ memories: string }>().memories).toBe(
      "- prefers lighter energy\n- likes sparse piano\n- dislikes harsh drums",
    );
    expect(memory.recalls.slice(-2)).toEqual([
      { query: "music preferences for a calm studying session", userId: ANONYMOUS_USER_ID },
      { query: "music preferences for studying sessions", userId: ANONYMOUS_USER_ID },
    ]);

    const remembered = await app.inject({
      method: "POST",
      url: "/memory/remember",
      payload: { fact: "likes sparse piano", session_id: "internal-s1", user_id: ANONYMOUS_USER_ID },
    });
    expect(remembered.statusCode).toBe(200);
    expect(memory.facts.length).toBe(beforeFacts + 1);

    const recorded = await app.inject({
      method: "POST",
      url: "/events",
      payload: {
        session_id: "internal-s1",
        user_id: ANONYMOUS_USER_ID,
        event_type: "skip_latency",
        payload: { energy: 3 },
      },
    });
    expect(recorded.statusCode).toBe(200);
    expect(events.countEvents("internal-s1")).toBe(1);

    const weights = await app.inject({
      method: "POST",
      url: "/events/skip-rate-by-energy",
      payload: { user_id: ANONYMOUS_USER_ID, recent_sessions: 10 },
    });
    expect(weights.statusCode).toBe(200);
    expect(weights.json<{ weights: Record<string, number> }>().weights[3]).toBeGreaterThan(0);
  });

  it("threads user_id through recall/remember and isolates skip weights per user (P0-2/P0-3)", async () => {
    await app.inject({
      method: "POST",
      url: "/memory/remember",
      payload: { fact: "loves dub techno", session_id: "iso-s1", user_id: "user-a" },
    });
    expect(memory.facts.at(-1)).toEqual({ fact: "loves dub techno", sessionId: "iso-s1", userId: "user-a" });

    await app.inject({ method: "POST", url: "/memory/recall", payload: { query: "q", user_id: "user-b" } });
    expect(memory.recalls.at(-1)).toEqual({ query: "q", userId: "user-b" });

    // User A skips energy-2 tracks; user B skips energy-5 tracks.
    await app.inject({
      method: "POST",
      url: "/events",
      payload: { session_id: "iso-a", user_id: "user-a", event_type: "skip_latency", payload: { energy: 2 } },
    });
    await app.inject({
      method: "POST",
      url: "/events",
      payload: { session_id: "iso-b", user_id: "user-b", event_type: "skip_latency", payload: { energy: 5 } },
    });

    const a = await app.inject({ method: "POST", url: "/events/skip-rate-by-energy", payload: { user_id: "user-a", recent_sessions: 10 } });
    const aWeights = a.json<{ weights: Record<string, number> }>().weights;
    expect(aWeights[2]).toBeGreaterThan(0);
    expect(aWeights[5]).toBeUndefined();

    const b = await app.inject({ method: "POST", url: "/events/skip-rate-by-energy", payload: { user_id: "user-b", recent_sessions: 10 } });
    const bWeights = b.json<{ weights: Record<string, number> }>().weights;
    expect(bWeights[5]).toBeGreaterThan(0);
    expect(bWeights[2]).toBeUndefined();
  });

  it("reads events back for offline eval scripts via /events/query (#66)", async () => {
    await app.inject({
      method: "POST",
      url: "/events",
      payload: { session_id: "q-s1", user_id: "q-user", event_type: "track_started", payload: { track_id: "t1" } },
    });
    await app.inject({
      method: "POST",
      url: "/events",
      payload: {
        session_id: "q-s1",
        user_id: "q-user",
        event_type: "playlist_feedback",
        payload: { feedback: "dislike", track_id: "t1", remaining_ids: ["t2"], source: "dj_tool" },
      },
    });
    await app.inject({
      method: "POST",
      url: "/events",
      payload: { session_id: "q-s2", user_id: "q-user", event_type: "track_started", payload: { track_id: "t9" } },
    });

    // By session: both q-s1 events, in insertion order, payload parsed.
    const bySession = await app.inject({ method: "POST", url: "/events/query", payload: { session_id: "q-s1" } });
    expect(bySession.statusCode).toBe(200);
    const rows = bySession.json<{ events: { event_type: string; ts: number; payload: { track_id?: string } }[] }>().events;
    expect(rows.map((e) => e.event_type)).toEqual(["track_started", "playlist_feedback"]);
    expect(rows[0]!.payload).toEqual({ track_id: "t1" });
    expect(rows[0]!.ts).toBeGreaterThan(0);

    // By user + event_type across sessions.
    const byUserType = await app.inject({
      method: "POST",
      url: "/events/query",
      payload: { user_id: "q-user", event_type: "track_started" },
    });
    expect(byUserType.json<{ events: { session_id: string }[] }>().events.map((e) => e.session_id)).toEqual(["q-s1", "q-s2"]);

    // No filter → 400 (analytics read, not a full dump).
    const unfiltered = await app.inject({ method: "POST", url: "/events/query", payload: { limit: 5 } });
    expect(unfiltered.statusCode).toBe(400);
  });

  it("rejects malformed internal API calls", async () => {
    const recall = await app.inject({ method: "POST", url: "/memory/recall", payload: {} });
    expect(recall.statusCode).toBe(400);

    const recallIntent = await app.inject({ method: "POST", url: "/memory/recall-intent", payload: { user_id: "u" } });
    expect(recallIntent.statusCode).toBe(400);

    const remember = await app.inject({ method: "POST", url: "/memory/remember", payload: { fact: "x" } });
    expect(remember.statusCode).toBe(400);

    const event = await app.inject({ method: "POST", url: "/events", payload: { session_id: "s1" } });
    expect(event.statusCode).toBe(400);

    const skipRate = await app.inject({ method: "POST", url: "/events/skip-rate-by-energy", payload: {} });
    expect(skipRate.statusCode).toBe(400);
  });
});

describe("memory-service /users/me/taste (S2)", () => {
  it("requires authentication for read and write", async () => {
    const get = await app.inject({ method: "GET", url: "/users/me/taste" });
    expect(get.statusCode).toBe(401);
    const put = await app.inject({ method: "PUT", url: "/users/me/taste", payload: { preferences: [] } });
    expect(put.statusCode).toBe(401);
  });

  it("saves and reloads a profile, resolving slugs and dual-writing a mem0 summary", async () => {
    const { id, token } = await registerUser("taste-save@example.com");
    const headers = { authorization: `Bearer ${token}` };
    const before = memory.facts.length;

    const put = await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: {
        preferences: [
          { entityType: "genre", entityId: "lo-fi", polarity: "prefer", source: "onboarding", strength: 2 },
          { entityType: "artist", entityId: "lana-del-delay", polarity: "prefer", source: "onboarding" },
          { entityType: "track", entityId: "t01", polarity: "avoid", source: "session" },
        ],
        freeText: "more jazzy today",
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = put.json<TasteProfileResponse>();
    expect(saved.catalogRevisionAtSave).toBe("test-rev-001");
    // artist slug resolves to the current catalog id.
    const artist = saved.preferences.find((p) => p.entityType === "artist");
    expect(artist?.resolvedId).toBe("a-lana-delay");
    expect(artist?.status).toBe("active");

    // mem0 dual-write fired for this user with a human-readable summary.
    expect(memory.facts.length).toBe(before + 1);
    const fact = memory.facts.at(-1)!;
    expect(fact.userId).toBe(id);
    expect(fact.fact).toContain("Lo-Fi"); // catalog label, not the raw slug
    expect(fact.fact).toContain("Lana Delay"); // artist display name, not the slug
    expect(fact.fact).toContain("more jazzy today");

    // Reload returns the same profile.
    const get = await app.inject({ method: "GET", url: "/users/me/taste", headers });
    expect(get.statusCode).toBe(200);
    const reloaded = get.json<TasteProfileResponse>();
    expect(reloaded.preferences).toHaveLength(3);
    expect(reloaded.freeText).toBe("more jazzy today");
    expect(reloaded.preferences.every((p) => p.status === "active")).toBe(true);
  });

  it("rejects unknown entities and malformed preferences with 400", async () => {
    const { token } = await registerUser("taste-invalid@example.com");
    const headers = { authorization: `Bearer ${token}` };

    const unknown = await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: {
        preferences: [
          { entityType: "genre", entityId: "lo-fi", polarity: "prefer", source: "onboarding" },
          { entityType: "artist", entityId: "no-such-artist", polarity: "prefer", source: "onboarding" },
        ],
      },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json<{ invalid: { entityId: string }[] }>().invalid).toEqual([
      { entityType: "artist", entityId: "no-such-artist" },
    ]);

    const malformed = await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: { preferences: [{ entityType: "genre", entityId: "lo-fi", polarity: "love", source: "onboarding" }] },
    });
    expect(malformed.statusCode).toBe(400);

    const duplicate = await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: {
        preferences: [
          { entityType: "genre", entityId: "lo-fi", polarity: "prefer", source: "onboarding" },
          { entityType: "genre", entityId: "lo-fi", polarity: "avoid", source: "session" },
        ],
      },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json<{ error: string }>().error).toContain("duplicates");

    // Nothing persisted from the rejected writes.
    const get = await app.inject({ method: "GET", url: "/users/me/taste", headers });
    expect(get.json<TasteProfileResponse>().preferences).toHaveLength(0);
  });

  it("replaces (not accumulates) the mem0 summary when a profile is re-saved", async () => {
    const { id, token } = await registerUser("taste-replace@example.com");
    const headers = { authorization: `Bearer ${token}` };
    const tasteFacts = () => memory.facts.filter((f) => f.userId === id);

    await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: { preferences: [{ entityType: "genre", entityId: "house", polarity: "prefer", source: "onboarding" }] },
    });
    expect(tasteFacts()).toHaveLength(1);

    // Re-save with the opposite polarity: the stale "prefers house" fact must
    // not survive alongside the new one.
    await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: { preferences: [{ entityType: "genre", entityId: "house", polarity: "avoid", source: "session" }] },
    });
    const facts = tasteFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toContain("Avoids");
    expect(facts[0].fact).not.toContain("Prefers");
  });

  it("isolates one user's profile from another", async () => {
    const a = await registerUser("taste-a@example.com");
    const b = await registerUser("taste-b@example.com");

    await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers: { authorization: `Bearer ${a.token}` },
      payload: { preferences: [{ entityType: "genre", entityId: "house", polarity: "prefer", source: "onboarding" }] },
    });

    const bView = await app.inject({
      method: "GET",
      url: "/users/me/taste",
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(bView.json<TasteProfileResponse>().preferences).toHaveLength(0);
  });

  it("exposes a user's active prefs for plan weighting via /taste/weights (S4)", async () => {
    const { id, token } = await registerUser("taste-weights@example.com");
    await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        preferences: [
          { entityType: "genre", entityId: "house", polarity: "avoid", source: "onboarding", strength: 3 },
          { entityType: "artist", entityId: "lana-del-delay", polarity: "prefer", source: "onboarding" },
        ],
      },
    });

    const res = await app.inject({ method: "POST", url: "/taste/weights", payload: { user_id: id } });
    expect(res.statusCode).toBe(200);
    const { preferences } = res.json<{ preferences: { entityType: string; entityId: string; polarity: string; status?: string }[] }>();
    expect(preferences).toHaveLength(2);
    expect(preferences.every((p) => p.status === "active")).toBe(true);
    expect(preferences.find((p) => p.entityType === "genre")).toMatchObject({ entityId: "house", polarity: "avoid" });

    const missing = await app.inject({ method: "POST", url: "/taste/weights", payload: {} });
    expect(missing.statusCode).toBe(400);
  });

  it("re-resolves slug-based prefs to new ids after a catalog rebuild (orphans track ids)", async () => {
    const { token } = await registerUser("taste-reload@example.com");
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({
      method: "PUT",
      url: "/users/me/taste",
      headers,
      payload: {
        preferences: [
          { entityType: "artist", entityId: "lana-del-delay", polarity: "prefer", source: "onboarding" },
          { entityType: "track", entityId: "t02", polarity: "prefer", source: "onboarding" },
        ],
      },
    });

    // Rebuild the catalog: artist keeps its slug but gets a new id; track t02 is gone.
    const reloaded = buildCatalogIndex(
      { artists: [{ id: "a-lana-delay-v2", name: "Lana Delay", slug: "lana-del-delay" }], albums: [], tracks: [{ id: "t01" }] } as unknown as CatalogManifest,
      { genres: [{ slug: "lo-fi", label: "Lo-Fi" }], mapping: {} },
      "test-rev-002",
    );
    const app2 = buildServer({ events, memory, auth, taste, catalog: reloaded });
    await app2.ready();
    try {
      const get = await app2.inject({ method: "GET", url: "/users/me/taste", headers });
      const profile = get.json<TasteProfileResponse>();
      expect(profile.catalogRevision).toBe("test-rev-002");
      const artist = profile.preferences.find((p) => p.entityType === "artist");
      expect(artist?.status).toBe("active");
      expect(artist?.resolvedId).toBe("a-lana-delay-v2"); // slug survived the id change
      const track = profile.preferences.find((p) => p.entityType === "track");
      expect(track?.status).toBe("orphaned"); // removed track id no longer resolves
    } finally {
      await app2.close();
    }
  });

  it("derives and persists session-sourced prefs (+ mem0 mirror) from a dislike (#69)", async () => {
    const { id, token } = await registerUser("feedback-dislike@example.com");
    const factsBefore = memory.facts.length;

    const res = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: id, session_id: "s-fb-1", track_id: "t01", feedback: "dislike", persist: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ preferences: unknown[]; persisted: boolean }>();
    expect(body.persisted).toBe(true);
    // Track pref (finest grain, strength 2) + artist rollup (strength 1) per #69.
    expect(body.preferences).toEqual([
      { entityType: "track", entityId: "t01", polarity: "avoid", strength: 2, source: "session" },
      { entityType: "artist", entityId: "lana-del-delay", polarity: "avoid", strength: 1, source: "session" },
    ]);

    // Durable rows readable on the next session via GET /users/me/taste and /taste/weights.
    const profile = await app.inject({ method: "GET", url: "/users/me/taste", headers: { authorization: `Bearer ${token}` } });
    const prefs = profile.json<TasteProfileResponse>().preferences;
    expect(prefs.find((p) => p.entityType === "track")).toMatchObject({ entityId: "t01", polarity: "avoid", source: "session", status: "active" });
    expect(prefs.find((p) => p.entityType === "artist")).toMatchObject({ entityId: "lana-del-delay", polarity: "avoid", source: "session", status: "active" });

    // mem0 mirror is human-readable, session-attributed, and names catalog labels.
    expect(memory.facts).toHaveLength(factsBefore + 1);
    const fact = memory.facts.at(-1)!;
    expect(fact.userId).toBe(id);
    expect(fact.sessionId).toBe("s-fb-1");
    expect(fact.fact).toContain("disliked");
    expect(fact.fact).toContain("Neon Rain");
    expect(fact.fact).toContain("Lana Delay");
    expect(fact.fact).toContain("Lo-Fi");
  });

  it("keeps one row per entity: repeats strengthen (capped), a flip resets polarity (#69)", async () => {
    const { id, token } = await registerUser("feedback-repeat@example.com");
    const feedback = (fb: "like" | "dislike") =>
      app.inject({
        method: "POST",
        url: "/taste/session-feedback",
        payload: { user_id: id, session_id: "s-fb-2", track_id: "t01", feedback: fb, persist: true },
      });
    const trackPref = async () => {
      const profile = await app.inject({ method: "GET", url: "/users/me/taste", headers: { authorization: `Bearer ${token}` } });
      const prefs = profile.json<TasteProfileResponse>().preferences;
      return { row: prefs.find((p) => p.entityType === "track" && p.entityId === "t01"), count: prefs.filter((p) => p.entityType === "track" && p.entityId === "t01").length };
    };

    await feedback("dislike");
    await feedback("dislike"); // duplicate in the same session → still one row, strengthened
    let { row, count } = await trackPref();
    expect(count).toBe(1);
    expect(row).toMatchObject({ polarity: "avoid", strength: 3 });

    await feedback("dislike"); // strength stays capped at 3
    ({ row } = await trackPref());
    expect(row?.strength).toBe(3);

    await feedback("like"); // opposite reaction replaces the row at base strength
    ({ row, count } = await trackPref());
    expect(count).toBe(1);
    expect(row).toMatchObject({ polarity: "prefer", strength: 2 });
  });

  it("never persists feedback for the anonymous identity or when persist is off (#69)", async () => {
    const factsBefore = memory.facts.length;

    const anonymous = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: ANONYMOUS_USER_ID, session_id: "s-fb-3", track_id: "t01", feedback: "dislike", persist: true },
    });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json<{ persisted: boolean; preferences: unknown[] }>().persisted).toBe(false);
    // Derived prefs still come back for the in-session queue nudge (#68).
    expect(anonymous.json<{ preferences: unknown[] }>().preferences).toHaveLength(2);
    const anonWeights = await app.inject({ method: "POST", url: "/taste/weights", payload: { user_id: ANONYMOUS_USER_ID } });
    expect(anonWeights.json<{ preferences: unknown[] }>().preferences).toHaveLength(0);

    // Conditions A/B send persist: false — derived only, nothing stored.
    const { id, token } = await registerUser("feedback-nopersist@example.com");
    const derivedOnly = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: id, session_id: "s-fb-3", track_id: "t01", feedback: "like", persist: false },
    });
    expect(derivedOnly.json<{ persisted: boolean }>().persisted).toBe(false);
    const profile = await app.inject({ method: "GET", url: "/users/me/taste", headers: { authorization: `Bearer ${token}` } });
    expect(profile.json<TasteProfileResponse>().preferences).toHaveLength(0);

    expect(memory.facts).toHaveLength(factsBefore); // no mem0 mirror either
  });

  it("returns no prefs for a track without catalog identity, and 400 on malformed calls", async () => {
    const spotify = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: "u-any", session_id: "s-fb-4", track_id: "spotify:track:xyz", feedback: "dislike", persist: true },
    });
    expect(spotify.statusCode).toBe(200);
    expect(spotify.json<{ preferences: unknown[]; persisted: boolean }>()).toEqual({ preferences: [], persisted: false });

    const missing = await app.inject({ method: "POST", url: "/taste/session-feedback", payload: { user_id: "u", track_id: "t01" } });
    expect(missing.statusCode).toBe(400);
    // regenerate is not a taste signal — the harness handles it as a queue rebuild.
    const regenerate = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: "u", session_id: "s", track_id: "t01", feedback: "regenerate" },
    });
    expect(regenerate.statusCode).toBe(400);
  });
});
