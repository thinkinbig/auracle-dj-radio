import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SESSION } from '@/data/demoData';
import { createInitialPlaybackState, playbackReducer } from './playbackReducer';
import {
  createSessionHistoryEntry,
  loadSessionHistory,
  saveSessionHistoryEntry,
  type SessionHistoryEntry,
} from './sessionHistory';

function startedState(sessionId: string, elapsedTicks = 1) {
  let state = playbackReducer(createInitialPlaybackState(), {
    type: 'start',
    session: { ...DEMO_SESSION, session_id: sessionId },
  });
  for (let i = 0; i < elapsedTicks; i += 1) state = playbackReducer(state, { type: 'tick' });
  return state;
}

function installFakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
}

describe('sessionHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not create a history entry for an unplayed session', () => {
    expect(createSessionHistoryEntry(createInitialPlaybackState(), 'u1')).toBeUndefined();
  });

  it('creates a saved session snapshot from playback state', () => {
    const entry = createSessionHistoryEntry(startedState('s1', 42), 'u1');
    expect(entry).toMatchObject({
      id: 's1',
      userId: 'u1',
      title: DEMO_SESSION.session_title,
      trackCount: DEMO_SESSION.tracklist.length,
      durationSec: 42,
    });
    expect(entry?.tracks[0]).toMatchObject({ id: DEMO_SESSION.tracklist[0]?.id });
    expect(entry?.tracks[0]?.title).toBeTruthy();
  });

  it('stores the newest session first and replaces duplicate ids', () => {
    installFakeStorage();
    const first = createSessionHistoryEntry(startedState('s1', 5), 'u1')!;
    const second = createSessionHistoryEntry(startedState('s2', 7), 'u1')!;
    const replacement: SessionHistoryEntry = { ...first, savedAt: first.savedAt + 1, durationSec: 9 };

    saveSessionHistoryEntry(first);
    saveSessionHistoryEntry(second);
    saveSessionHistoryEntry(replacement);

    expect(loadSessionHistory('u1').map((entry) => [entry.id, entry.durationSec])).toEqual([
      ['s1', 9],
      ['s2', 7],
    ]);
  });
});
