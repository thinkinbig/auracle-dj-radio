import { describe, expect, it, vi } from "vitest";
import type { LiveServerMessage } from "@google/genai";
import { LiveVoiceChannel, type VoiceChannelHooks } from "../src/live/voice-channel.js";
import type { SessionState } from "../src/session/store.js";

function mockState(): SessionState {
  return {
    id: "s1",
    intent: { mood: "calm", scene: "study", duration_min: 25 },
    condition: "C",
    hostMode: "curator",
    title: "Quiet Hours",
    subtitle: "25 min",
    arc: "wind_down",
    tracklist: [
      { id: "a", flow_position: 1, reason: "" },
      { id: "b", flow_position: 2, reason: "" },
    ],
    currentTrackIndex: 0,
    playedTrackIds: [],
    energyById: new Map(),
    mem0Context: "",
  };
}

function mockHooks(): VoiceChannelHooks & {
  sendFrame: ReturnType<typeof vi.fn>;
  sendAudio: ReturnType<typeof vi.fn>;
  onToolCall: ReturnType<typeof vi.fn>;
  onClosed: ReturnType<typeof vi.fn>;
} {
  return { sendFrame: vi.fn(), sendAudio: vi.fn(), onToolCall: vi.fn(), onClosed: vi.fn() };
}

const audioMsg = (b64: string): LiveServerMessage =>
  ({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64, mimeType: "audio/pcm" } }] } } }) as LiveServerMessage;
const turnComplete = { serverContent: { turnComplete: true } } as LiveServerMessage;

// The hot path is testable in isolation — no replan/mem0/db, no real Gemini session.
describe("LiveVoiceChannel (hot path)", () => {
  it("emits dj_turn_start and forwards DJ audio", () => {
    const hooks = mockHooks();
    const vc = new LiveVoiceChannel(mockState(), { getTrack: () => undefined }, hooks);

    vc.handleServerMessage(audioMsg("AAAA"));

    expect(hooks.sendFrame).toHaveBeenCalledWith({ type: "phase", phase: "dj_turn_start", track_index: 0 });
    expect(hooks.sendAudio).toHaveBeenCalledOnce();
    expect(vc.producedAudio).toBe(true);
  });

  it("emits dj_turn_end on turnComplete", () => {
    const hooks = mockHooks();
    const vc = new LiveVoiceChannel(mockState(), { getTrack: () => undefined }, hooks);

    vc.handleServerMessage(audioMsg("AAAA"));
    vc.handleServerMessage(turnComplete);

    expect(hooks.sendFrame).toHaveBeenCalledWith({ type: "phase", phase: "dj_turn_end", track_index: 0 });
  });

  it("routes tool calls to the cold seam, never as audio", () => {
    const hooks = mockHooks();
    const vc = new LiveVoiceChannel(mockState(), { getTrack: () => undefined }, hooks);
    const calls = [{ id: "1", name: "skip_track", args: {} }];

    vc.handleServerMessage({ toolCall: { functionCalls: calls } } as LiveServerMessage);

    expect(hooks.onToolCall).toHaveBeenCalledWith(calls);
    expect(hooks.sendAudio).not.toHaveBeenCalled();
  });

  it("stamps phase frames with the cued Playhead", () => {
    const hooks = mockHooks();
    const vc = new LiveVoiceChannel(mockState(), { getTrack: () => undefined }, hooks);

    vc.cue(1); // a segue for track 1
    vc.handleServerMessage(audioMsg("AAAA"));

    expect(hooks.sendFrame).toHaveBeenCalledWith({ type: "phase", phase: "dj_turn_start", track_index: 1 });
  });

  it("suppresses the rest of a skipped voice-over", () => {
    const hooks = mockHooks();
    const vc = new LiveVoiceChannel(mockState(), { getTrack: () => undefined }, hooks);

    vc.handleServerMessage(audioMsg("AAAA")); // turn starts, djSpeaking
    vc.skip(); // emits dj_turn_end, suppresses the rest
    expect(hooks.sendFrame).toHaveBeenCalledWith({ type: "phase", phase: "dj_turn_end", track_index: 0 });

    const audioCalls = hooks.sendAudio.mock.calls.length;
    vc.handleServerMessage(audioMsg("BBBB")); // drained audio — must be swallowed
    expect(hooks.sendAudio.mock.calls.length).toBe(audioCalls);
  });
});
