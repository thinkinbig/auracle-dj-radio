import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthStore } from "../src/auth-store.js";
import { EventsDb } from "../src/events-db.js";
import type { MemoryClient } from "../src/memory/client.js";
import { buildServer } from "../src/server.js";

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
    const recall = await app.inject({ method: "POST", url: "/memory/recall", payload: { query: "calm studying" } });
    expect(recall.statusCode).toBe(200);
    expect(recall.json<{ memories: string }>().memories).toBe("");

    const beforeFacts = memory.facts.length;
    const remembered = await app.inject({
      method: "POST",
      url: "/memory/remember",
      payload: { fact: "likes sparse piano", session_id: "internal-s1" },
    });
    expect(remembered.statusCode).toBe(200);
    expect(memory.facts.length).toBe(beforeFacts + 1);

    const recorded = await app.inject({
      method: "POST",
      url: "/events",
      payload: { session_id: "internal-s1", event_type: "skip_latency", payload: { energy: 3 } },
    });
    expect(recorded.statusCode).toBe(200);
    expect(events.countEvents("internal-s1")).toBe(1);

    const weights = await app.inject({ method: "POST", url: "/events/skip-rate-by-energy", payload: { recent_sessions: 10 } });
    expect(weights.statusCode).toBe(200);
    expect(weights.json<{ weights: Record<string, number> }>().weights[3]).toBeGreaterThan(0);
  });

  it("rejects malformed internal API calls", async () => {
    const recall = await app.inject({ method: "POST", url: "/memory/recall", payload: {} });
    expect(recall.statusCode).toBe(400);

    const remember = await app.inject({ method: "POST", url: "/memory/remember", payload: { fact: "x" } });
    expect(remember.statusCode).toBe(400);

    const event = await app.inject({ method: "POST", url: "/events", payload: { session_id: "s1" } });
    expect(event.statusCode).toBe(400);
  });
});
