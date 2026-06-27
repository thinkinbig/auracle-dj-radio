import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID, type CatalogManifest, type TasteProfileResponse } from "@auracle/shared";
import { AuthStore } from "../src/auth-store.js";
import { buildCatalogIndex, type CatalogIndex } from "../src/catalog-index.js";
import { EventsDb } from "../src/events-db.js";
import type { MemoryClient } from "../src/memory/client.js";
import { PlaylistStore } from "../src/playlist-store.js";
import { TasteStore } from "../src/taste/taste-store.js";
import { buildServer } from "../src/server.js";

/** Deterministic test catalog (independent of the seeded 16-track manifest). */
function testManifest(artistId = "a-lana-delay"): CatalogManifest {
  return {
    artists: [{ id: artistId, name: "Lana Delay", slug: "lana-del-delay" }],
    albums: [{ id: "alb-lana-delay-midnight", title: "Born to Delay", slug: "lana-del-delay/born-to-delay", artistId }],
    tracks: [{ id: "t01" }, { id: "t02" }],
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
let playlists: PlaylistStore;
let taste: TasteStore;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "memory-service-")), "events.sqlite");
  const authDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-auth-")), "auth.sqlite");
  const tasteDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-taste-")), "taste.sqlite");
  const playlistDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-playlists-")), "playlists.sqlite");
  events = new EventsDb(dbPath);
  auth = new AuthStore(authDbPath);
  taste = new TasteStore(tasteDbPath);
  playlists = new PlaylistStore(playlistDbPath);
  memory = new RecordingMemory();
  app = buildServer({ events, memory, auth, taste, playlists, catalog: testCatalog() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  events.close();
  auth.close();
  taste.close();
  playlists.close();
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
    const app2 = buildServer({ events, memory, auth, taste, playlists, catalog: reloaded });
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
});

describe("memory-service /users/me/playlists", () => {
  it("requires authentication", async () => {
    const get = await app.inject({ method: "GET", url: "/users/me/playlists" });
    expect(get.statusCode).toBe(401);
    const post = await app.inject({
      method: "POST",
      url: "/users/me/playlists",
      payload: { name: "Archive", source: "manual", tracks: [{ title: "A", artist: "B" }] },
    });
    expect(post.statusCode).toBe(401);
  });

  it("saves imported playlist metadata, lists it, and writes memory context", async () => {
    const { id, token } = await registerUser("playlist-import@example.com");
    const headers = { authorization: `Bearer ${token}` };
    const before = memory.facts.length;

    const post = await app.inject({
      method: "POST",
      url: "/users/me/playlists",
      headers,
      payload: {
        name: "Fourteen years",
        source: "spotify_export",
        tracks: [
          { title: "Night Drive", artist: "Nova Pulse", album: "After Hours", genre: "Synthwave", year: 2014 },
          { title: "Glass Coast", artist: "Nova Pulse", genre: "Synthwave", year: 2018 },
          { title: "Rain Study", artist: "Lana Delay", genre: "Ambient", year: 2021 },
        ],
      },
    });
    expect(post.statusCode).toBe(201);
    const profile = post.json<{ profile: { id: string; trackCount: number; summary: { topArtists: string[]; topGenres: string[]; yearStart: number; yearEnd: number } } }>().profile;
    expect(profile.trackCount).toBe(3);
    expect(profile.summary.topArtists[0]).toBe("Nova Pulse");
    expect(profile.summary.topGenres).toEqual(["Synthwave", "Ambient"]);
    expect(profile.summary.yearStart).toBe(2014);
    expect(profile.summary.yearEnd).toBe(2021);

    const list = await app.inject({ method: "GET", url: "/users/me/playlists", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ playlists: { id: string }[] }>().playlists[0]?.id).toBe(profile.id);

    expect(memory.facts.length).toBe(before + 1);
    expect(memory.facts.at(-1)).toMatchObject({ userId: id });
    expect(memory.facts.at(-1)?.fact).toContain("Fourteen years");
    expect(memory.facts.at(-1)?.fact).toContain("Nova Pulse");
  });

  it("rejects malformed playlist imports", async () => {
    const { token } = await registerUser("playlist-invalid@example.com");
    const headers = { authorization: `Bearer ${token}` };

    const badSource = await app.inject({
      method: "POST",
      url: "/users/me/playlists",
      headers,
      payload: { name: "Bad", source: "api", tracks: [{ title: "A", artist: "B" }] },
    });
    expect(badSource.statusCode).toBe(400);

    const noTracks = await app.inject({
      method: "POST",
      url: "/users/me/playlists",
      headers,
      payload: { name: "Bad", source: "manual", tracks: [] },
    });
    expect(noTracks.statusCode).toBe(400);
  });
});
