import { describe, expect, it } from 'vitest';
import type { PlannedTrack } from '@auracle/shared';
import { trackLoadKey } from './useTrackPlayback';

function slot(id: string, flow_position: number, uri = `local:${id}`): PlannedTrack {
  return {
    id,
    uri,
    flow_position,
    reason: 'test',
    title: '',
    artist: '',
    albumTitle: '',
    albumCoverUrl: '',
    durationSec: 0,
    energy: 3,
    voicing: { artistPersona: '', albumConcept: '', lore: '' },
  };
}

describe('trackLoadKey', () => {
  it('stays stable when a refine update only changes remaining tracks', () => {
    const current = slot('t1', 1);
    const before = {
      sessionId: 's1',
      currentTrackIndex: 0,
      trackId: 't1',
      sessionTracklist: [current, slot('t2', 2), slot('t3', 3)],
    };
    const after = {
      ...before,
      sessionTracklist: [current, slot('x2', 2), slot('x3', 3)],
    };

    expect(trackLoadKey(after)).toBe(trackLoadKey(before));
  });

  it('changes when the current playable uri changes', () => {
    const before = {
      sessionId: 's1',
      currentTrackIndex: 0,
      trackId: 't1',
      sessionTracklist: [slot('t1', 1, 'local:t1')],
    };
    const after = {
      ...before,
      sessionTracklist: [slot('t1', 1, 'spotify:track:abc')],
    };

    expect(trackLoadKey(after)).not.toBe(trackLoadKey(before));
  });
});
