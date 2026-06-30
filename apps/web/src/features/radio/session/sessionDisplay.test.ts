import { describe, expect, it } from 'vitest';
import { createInitialPlaybackState } from './playbackReducer';
import {
  deriveSessionTimeline,
  formatSavedAt,
  hasStartedSession,
} from './sessionDisplay';

describe('sessionDisplay', () => {
  it('hasStartedSession is true when phase is not idle or sessionId exists', () => {
    const idle = createInitialPlaybackState();
    expect(hasStartedSession(idle)).toBe(false);

    const playing = { ...idle, phase: 'playing' as const };
    expect(hasStartedSession(playing)).toBe(true);
  });

  it('deriveSessionTimeline uses tracklist instead of hardcoded demo titles', () => {
    const state = {
      ...createInitialPlaybackState(),
      phase: 'playing' as const,
      sessionId: 'sess-1',
      trackTitle: 'Current Song',
      sessionSubtitle: 'Now playing',
      currentTrackIndex: 0,
      sessionTracklist: [
        { id: 't1', flow_position: 1, reason: 'test' },
        { id: 't2', flow_position: 2, reason: 'test' },
        { id: 't3', flow_position: 3, reason: 'test' },
      ],
    };

    const timeline = deriveSessionTimeline(true, state);
    expect(timeline[0]).toEqual({ title: 'Current Song', detail: 'Now playing' });
    expect(timeline[1]?.title).toBe('t2');
    expect(timeline[2]?.title).toBe('t3');
  });

  it('formatSavedAt returns a non-empty label', () => {
    expect(formatSavedAt(Date.UTC(2026, 5, 30, 14, 30))).toMatch(/Jun/);
  });
});
