import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID, type CatalogManifest } from "@auracle/shared";
import { AuthStore } from "../src/auth-store.js";
import { buildCatalogIndex, type CatalogIndex } from "../src/catalog-index.js";
import { EventsDb } from "../src/events-db.js";
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

let app: ReturnType<typeof buildServer>;
let events: EventsDb;
let auth: AuthStore;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "profile-service-")), "events.sqlite");
  const authDbPath = join(mkdtempSync(join(tmpdir(), "profile-service-auth-")), "auth.sqlite");
  events = new EventsDb(dbPath);
  auth = new AuthStore(authDbPath);
  app = buildServer({ events, auth, catalog: testCatalog() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  events.close();
  auth.close();
});

/** Register a fresh user and return its id + bearer token. */
async function registerUser(email: string): Promise<{ id: string; token: string }> {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "Secret123" } });
  const body = res.json<{ user: { id: string }; token: string }>();
  return { id: body.user.id, token: body.token };
}

describe("profile-service /auth", () => {
  it("registers, restores the current user, rejects duplicate email, and logs out", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "Listener@Example.com", password: "Secret123", name: "Listener" },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json<{ user: { email: string; name: string }; token: string }>();
    expect(body.user.email).toBe("listener@example.com");
    expect(body.user.name).toBe("Listener");
    expect(body.token).toBeTruthy();

    const duplicate = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "listener@example.com", password: "Secret123" },
    });
    expect(duplicate.statusCode).toBe(409);

    const weakPassword = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "weak@example.com", password: "secret123" },
    });
    expect(weakPassword.statusCode).toBe(400);

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
      payload: { email: "login@example.com", password: "Secret123" },
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
      payload: { email: "login@example.com", password: "Secret123" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ token: string }>().token).toBeTruthy();
  });
});

describe("profile-service internal events API", () => {
  it("does not expose retired memory endpoints, but still records events", async () => {
    const recall = await app.inject({
      method: "POST",
      url: "/memory/recall",
      payload: { query: "calm studying", user_id: ANONYMOUS_USER_ID },
    });
    expect(recall.statusCode).toBe(404);

    const intentRecall = await app.inject({
      method: "POST",
      url: "/memory/recall-intent",
      payload: { mood: "calm", scene: "studying", user_id: ANONYMOUS_USER_ID },
    });
    expect(intentRecall.statusCode).toBe(404);

    const remembered = await app.inject({
      method: "POST",
      url: "/memory/remember",
      payload: { fact: "likes sparse piano", session_id: "internal-s1", user_id: ANONYMOUS_USER_ID },
    });
    expect(remembered.statusCode).toBe(404);

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
  });

  it("keeps event queries isolated per user without derived skip weights (P0-2/P0-3)", async () => {
    const remembered = await app.inject({
      method: "POST",
      url: "/memory/remember",
      payload: { fact: "loves dub techno", session_id: "iso-s1", user_id: "user-a" },
    });
    expect(remembered.statusCode).toBe(404);

    const recall = await app.inject({ method: "POST", url: "/memory/recall", payload: { query: "q", user_id: "user-b" } });
    expect(recall.statusCode).toBe(404);

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

    const a = await app.inject({ method: "POST", url: "/events/query", payload: { user_id: "user-a", event_type: "skip_latency" } });
    expect(a.json<{ events: { payload: { energy: number } }[] }>().events.map((event) => event.payload.energy)).toEqual([2]);

    const b = await app.inject({ method: "POST", url: "/events/query", payload: { user_id: "user-b", event_type: "skip_latency" } });
    expect(b.json<{ events: { payload: { energy: number } }[] }>().events.map((event) => event.payload.energy)).toEqual([5]);
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
    expect(recall.statusCode).toBe(404);

    const recallIntent = await app.inject({ method: "POST", url: "/memory/recall-intent", payload: { user_id: "u" } });
    expect(recallIntent.statusCode).toBe(404);

    const remember = await app.inject({ method: "POST", url: "/memory/remember", payload: { fact: "x" } });
    expect(remember.statusCode).toBe(404);

    const event = await app.inject({ method: "POST", url: "/events", payload: { session_id: "s1" } });
    expect(event.statusCode).toBe(400);

    const skipRate = await app.inject({ method: "POST", url: "/events/skip-rate-by-energy", payload: {} });
    expect(skipRate.statusCode).toBe(404);
  });
});

describe("profile-service session taste feedback", () => {
  it("does not expose retired user taste profile endpoints", async () => {
    const get = await app.inject({ method: "GET", url: "/users/me/taste" });
    expect(get.statusCode).toBe(404);
    const put = await app.inject({ method: "PUT", url: "/users/me/taste", payload: { preferences: [] } });
    expect(put.statusCode).toBe(404);
  });

  it("does not expose retired /taste/weights", async () => {
    const res = await app.inject({ method: "POST", url: "/taste/weights", payload: { user_id: "taste-weights" } });
    expect(res.statusCode).toBe(404);

    const missing = await app.inject({ method: "POST", url: "/taste/weights", payload: {} });
    expect(missing.statusCode).toBe(404);
  });

  it("derives session-sourced prefs from a dislike (#69)", async () => {
    const { id } = await registerUser("feedback-dislike@example.com");

    const res = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: id, session_id: "s-fb-1", track_id: "t01", feedback: "dislike" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ preferences: unknown[] }>();
    // Track pref (finest grain, strength 2) + artist rollup (strength 1) per #69.
    expect(body.preferences).toEqual([
      { entityType: "track", entityId: "t01", polarity: "avoid", strength: 2, source: "session" },
      { entityType: "artist", entityId: "lana-del-delay", polarity: "avoid", strength: 1, source: "session" },
    ]);
  });

  it("derives prefs for any user id without persisting (#69)", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: "any-user", session_id: "s-fb-3", track_id: "t01", feedback: "dislike" },
    });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json<{ preferences: unknown[] }>().preferences).toHaveLength(2);
  });

  it("returns no prefs for a track without catalog identity, and 400 on malformed calls", async () => {
    const spotify = await app.inject({
      method: "POST",
      url: "/taste/session-feedback",
      payload: { user_id: "u-any", session_id: "s-fb-4", track_id: "spotify:track:xyz", feedback: "dislike" },
    });
    expect(spotify.statusCode).toBe(200);
    expect(spotify.json<{ preferences: unknown[] }>()).toEqual({ preferences: [] });

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
