import { describe, expect, it } from 'vitest';
import { createInitialPlaybackState, playbackReducer, updateTranscript } from './playbackReducer';
import { DEMO_SESSION } from '../mock/demoData';

describe('playbackReducer', () => {
  it('starts session in opening phase', () => {
    const next = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: { ...DEMO_SESSION, session_id: 's1' },
    });
    expect(next.phase).toBe('opening');
    expect(next.sessionId).toBe('s1');
    expect(next.hostMode).toBe(DEMO_SESSION.host_mode);
    expect(next.currentTrackIndex).toBe(0);
  });

  it('maps dj_turn_end to playing', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const speaking = playbackReducer(base, { type: 'server_phase', phase: 'dj_turn_start' });
    expect(speaking.phase).toBe('speaking');
    const playing = playbackReducer(speaking, { type: 'server_phase', phase: 'dj_turn_end' });
    expect(playing.phase).toBe('playing');
  });

  it('merges streaming transcript lines', () => {
    const first = updateTranscript([], null, 'model', 'Hello', 0);
    const second = updateTranscript(first.lines, first.activeId, 'model', 'Hello world', 1);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]?.text).toBe('Hello world');
  });

  it('shows live warning when session falls back to demo', () => {
    const next = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    expect(next.liveWarning).toContain('Live opening voice-over');
  });

  it('updates host mode from live intent or user change', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const next = playbackReducer(base, { type: 'set_host_mode', hostMode: 'hype' });
    expect(next.hostMode).toBe('hype');
  });

  it('opens the listening window when a DJ turn ends during a break (ADR-0004)', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const inBreak = playbackReducer(base, { type: 'enter_break' });
    expect(inBreak.inBreak).toBe(true);
    const speaking = playbackReducer(inBreak, { type: 'server_phase', phase: 'dj_turn_start' });
    expect(speaking.phase).toBe('speaking');
    const listening = playbackReducer(speaking, { type: 'server_phase', phase: 'dj_turn_end' });
    expect(listening.phase).toBe('listening');
  });

  it('drops a stale DJ-turn phase frame from an earlier Playhead (skip mid-turn)', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    // Skip to track 1 while track 0's DJ turn is still draining.
    const advanced = playbackReducer(base, { type: 'advance' });
    expect(advanced.currentTrackIndex).toBe(1);
    expect(advanced.phase).toBe('playing');
    // The old turn's dj_turn_start (stamped index 0) must NOT flip track 1 to speaking.
    const fenced = playbackReducer(advanced, {
      type: 'server_phase',
      phase: 'dj_turn_start',
      trackIndex: 0,
    });
    expect(fenced.phase).toBe('playing');
    // The new track's own turn (index 1) is honoured.
    const live = playbackReducer(advanced, {
      type: 'server_phase',
      phase: 'dj_turn_start',
      trackIndex: 1,
    });
    expect(live.phase).toBe('speaking');
  });

  it('clears the break on advance', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const inBreak = playbackReducer(base, { type: 'enter_break' });
    const advanced = playbackReducer(inBreak, { type: 'advance' });
    expect(advanced.inBreak).toBe(false);
    expect(advanced.currentTrackIndex).toBe(1);
  });

  it('counts a fresh user utterance once, not per streamed chunk', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const first = playbackReducer(base, { type: 'transcript', role: 'user', text: 'make it' });
    const streamed = playbackReducer(first, { type: 'transcript', role: 'user', text: 'make it calmer' });
    expect(streamed.userUtteranceCount).toBe(1);
    // A model reply then a new user line counts as a second utterance.
    const reply = playbackReducer(streamed, { type: 'transcript', role: 'model', text: 'Sure' });
    const second = playbackReducer(reply, { type: 'transcript', role: 'user', text: 'actually skip' });
    expect(second.userUtteranceCount).toBe(2);
  });
});
