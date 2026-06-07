import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../src/session/store.js";
import { LiveToolRunner } from "../src/live/tool-runner.js";

function mockState(): SessionState {
  return {
    id: "s1",
    intent: { mood: "calm", scene: "study", duration_min: 25 },
    condition: "C",
    hostMode: "curator",
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
    expect(res).toMatchObject({ ok: true, host_mode: "hype", previous: "curator", changed: true });
    expect(state.hostMode).toBe("hype");
    expect(replan).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith("s1", "change_host_mode", {
      host_mode: "hype",
      previous: "curator",
    });
    expect(send).toHaveBeenCalledWith({
      type: "intent",
      intent: { type: "host_mode_changed", host_mode: "hype" },
    });
  });

  it("mood_change acks immediately without awaiting the slow replan", async () => {
    const send = vi.fn();
    let resolveReplan!: (o: { replanned: boolean; remaining: [] }) => void;
    const replan = vi.fn(
      () => new Promise<{ replanned: boolean; remaining: [] }>((r) => (resolveReplan = r)),
    );
    const runner = new LiveToolRunner(mockState(), {
      recordEvent: vi.fn(),
      getTrack: () => undefined,
      memory: { enabled: false, degraded: false, recall: async () => "", remember: async () => {} },
      replan,
    }, send);

    // The tool response resolves now, while replan is still pending (hot/cold split).
    const res = await runner.run({ name: "mood_change", args: { mood: "darker" } });
    expect(res).toMatchObject({ ok: true });
    expect(replan).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      type: "intent",
      intent: { type: "mood_change", mood: "darker", energy_delta: "same" },
    });
    // The new arc is pushed only once replan lands, off the tool-response path.
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "tracklist_updated" }));
    resolveReplan({ replanned: true, remaining: [] });
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "tracklist_updated" }));
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
