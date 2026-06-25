import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID } from "@auracle/shared";
import { AuthStore } from "../src/auth-store.js";
import { EventsDb } from "../src/events-db.js";
import type { MemoryClient } from "../src/memory/client.js";
import { buildServer } from "../src/server.js";

class RecordingMemory implements MemoryClient {
  readonly enabled = true;
  readonly degraded = false;
  facts: { fact: string; userId: string }[] = [];
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
  async remember(fact: string, _sessionId: string, userId: string): Promise<void> {
    this.facts.push({ fact, userId });
  }
}

let app: ReturnType<typeof buildServer>;
let events: EventsDb;
let auth: AuthStore;
let memory: RecordingMemory;

beforeAll(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "memory-service-")), "events.sqlite");
  const authDbPath = join(mkdtempSync(join(tmpdir(), "memory-service-auth-")), "auth.sqlite");
  events = new EventsDb(dbPath);
  auth = new AuthStore(authDbPath);
  memory = new RecordingMemory();
  app = buildServer({ events, memory, auth });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  events.close();
  auth.close();
});

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
    expect(memory.facts.at(-1)).toEqual({ fact: "loves dub techno", userId: "user-a" });

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
