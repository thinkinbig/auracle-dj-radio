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
});
