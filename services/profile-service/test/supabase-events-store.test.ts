import { describe, expect, it, vi } from "vitest";
import { SupabaseEventsStore } from "../src/supabase-events-store.js";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), init);
}

describe("SupabaseEventsStore", () => {
  it("writes event telemetry via the stateless Data API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(undefined, { status: 201 }));
    const store = new SupabaseEventsStore("https://project.supabase.co/", "sb_secret_test", fetchImpl);

    await store.recordEvent("s-1", "u-1", "track_started", { track_id: "t-1" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://project.supabase.co/rest/v1/session_events");
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_test");
    expect(new Headers(init?.headers).get("prefer")).toBe("return=minimal");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      session_id: "s-1",
      user_id: "u-1",
      event_type: "track_started",
      payload_json: { track_id: "t-1" },
    });
  });

  it("filters event reads in the Data API request and preserves parsed payloads", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response([
      {
        id: "7",
        session_id: "s-1",
        user_id: "u-1",
        ts: "123",
        event_type: "track_started",
        payload_json: { track_id: "t-1" },
      },
    ]));
    const store = new SupabaseEventsStore("https://project.supabase.co", "sb_secret_test", fetchImpl);

    await expect(store.queryEvents({ sessionId: "s-1", userId: "u-1", limit: 5 })).resolves.toEqual([
      {
        id: 7,
        session_id: "s-1",
        user_id: "u-1",
        ts: 123,
        event_type: "track_started",
        payload: { track_id: "t-1" },
      },
    ]);

    const [url] = fetchImpl.mock.calls[0]!;
    const params = new URL(String(url)).searchParams;
    expect(params.get("session_id")).toBe("eq.s-1");
    expect(params.get("user_id")).toBe("eq.u-1");
    expect(params.get("limit")).toBe("5");
  });
});
