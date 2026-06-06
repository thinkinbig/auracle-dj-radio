import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../src/session/store.js";
import { LiveToolRunner } from "../src/live/tool-runner.js";

function mockState(): SessionState {
  return {
    id: "s1",
    intent: { mood: "calm", scene: "study", duration_min: 25 },
    condition: "C",
    hostMode: "minimal",
    title: "Quiet Hours",
    subtitle: "25 min",
    arc: "wind_down",
    tracklist: [],
    currentTrackIndex: 0,
    playedTrackIds: [],
    energyById: new Map(),
    mem0Context: "",
  };
}

describe("LiveToolRunner", () => {
  it("skip_track emits intent and records event", async () => {
    const send = vi.fn();
    const recordEvent = vi.fn();
    const runner = new LiveToolRunner(mockState(), {
      recordEvent,
      getTrack: () => undefined,
      memory: { enabled: false, degraded: false, recall: async () => "", remember: async () => {} },
      replan: async () => ({ replanned: false, remaining: [] }),
    }, send);

    const res = await runner.run({ name: "skip_track", args: {} });
    expect(res).toEqual({ ok: true });
    expect(recordEvent).toHaveBeenCalledWith("s1", "skip_track", {});
    expect(send).toHaveBeenCalledWith({ type: "intent", intent: { type: "skip_track" } });
  });

  it("change_host_mode updates state without replan", async () => {
    const state = mockState();
    const send = vi.fn();
    const recordEvent = vi.fn();
    const replan = vi.fn();
    const runner = new LiveToolRunner(state, {
      recordEvent,
      getTrack: () => undefined,
      memory: { enabled: false, degraded: false, recall: async () => "", remember: async () => {} },
      replan,
    }, send);

    const res = await runner.run({ name: "change_host_mode", args: { host_mode: "hype" } });
    expect(res).toMatchObject({ ok: true, host_mode: "hype", previous: "minimal", changed: true });
    expect(state.hostMode).toBe("hype");
    expect(replan).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith("s1", "change_host_mode", {
      host_mode: "hype",
      previous: "minimal",
    });
    expect(send).toHaveBeenCalledWith({
      type: "intent",
      intent: { type: "host_mode_changed", host_mode: "hype" },
    });
  });

  it("change_host_mode rejects invalid mode", async () => {
    const runner = new LiveToolRunner(mockState(), {
      recordEvent: vi.fn(),
      getTrack: () => undefined,
      memory: { enabled: false, degraded: false, recall: async () => "", remember: async () => {} },
      replan: async () => ({ replanned: false, remaining: [] }),
    }, vi.fn());

    const res = await runner.run({ name: "change_host_mode", args: { host_mode: "podcast" } });
    expect(res).toEqual({ ok: false, error: "invalid host_mode" });
  });
});
