import { describe, expect, it } from 'vitest';
import type { PlannedTrack } from '@auracle/shared';
import { createInitialPlaybackState, mapServerPhase, playbackReducer, updateTranscript } from './playbackReducer';
import { DEMO_SESSION } from '@/data/demoData';

/** A minimal self-describing catalog slot for reducer fixtures. */
function slot(id: string, flow_position: number, reason: string): PlannedTrack {
  return {
    id,
    uri: `local:${id}`,
    flow_position,
    reason,
    title: '',
    artist: '',
    albumTitle: '',
    albumCoverUrl: '',
    durationSec: 0,
    energy: 3,
    voicing: { artistPersona: '', albumConcept: '', lore: '' },
  };
}

describe('mapServerPhase', () => {
  it('maps live phases to UI phases', () => {
    expect(mapServerPhase('dj_turn_start')).toBe('speaking');
    expect(mapServerPhase('dj_turn_end')).toBe('playing');
    expect(mapServerPhase('user_barge_in')).toBe('listening');
  });
});

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

  it('stops playback and flags the superseded UX on session_superseded (#55)', () => {
    const playing = playbackReducer(
      playbackReducer(createInitialPlaybackState(), { type: 'start', session: DEMO_SESSION }),
      { type: 'server_phase', phase: 'dj_turn_start' },
    );
    expect(playing.superseded).toBe(false);
    const superseded = playbackReducer(playing, { type: 'session_superseded' });
    expect(superseded.superseded).toBe(true);
    expect(superseded.phase).toBe('paused');
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
    const next = playbackReducer(base, { type: 'set_host_mode', hostMode: 'roast' });
    expect(next.hostMode).toBe('roast');
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

  it('opens the listening window when the user skips voice-over during a break', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const inBreak = playbackReducer(base, { type: 'enter_break' });
    const speaking = playbackReducer(inBreak, { type: 'server_phase', phase: 'dj_turn_start' });
    const listening = playbackReducer(speaking, { type: 'skip_voice_over' });
    expect(listening.phase).toBe('listening');
    expect(listening.inBreak).toBe(true);
  });

  it('returns to playing when the user skips a mid-track intro voice-over', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const speaking = playbackReducer(base, { type: 'server_phase', phase: 'dj_turn_start', trackIndex: 0 });
    const playing = playbackReducer(speaking, { type: 'skip_voice_over' });
    expect(playing.phase).toBe('playing');
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

  it('records playlist feedback without mutating the queue (server owns the tracklist)', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    for (const feedback of ['like', 'dislike', 'regenerate'] as const) {
      const next = playbackReducer(base, { type: 'playlist_feedback', feedback });
      expect(next.playlistFeedback).toBe(feedback);
      if (feedback === 'regenerate') {
        expect(next.queueRefreshStatus).toBe('pending');
      }
      // The queue and current track are left for the server's `tracklist_updated`.
      expect(next.remainingTrackIds).toEqual(base.remainingTrackIds);
      expect(next.trackId).toBe(base.trackId);
    }
  });

  it('replaces remaining queue refs when the server pushes an updated tracklist', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const regenerating = playbackReducer(base, { type: 'playlist_feedback', feedback: 'regenerate' });
    const updated = playbackReducer(regenerating, {
      type: 'tracklist_updated',
      remaining: [
        slot('a', 2, 'fresh pivot'),
        slot('b', 3, 'second fresh slot'),
      ],
    });
    expect(updated.playlistFeedback).toBe('regenerate');
    expect(updated.queueRefreshStatus).toBe('complete');
    expect(updated.remainingTrackIds).toEqual(['a', 'b']);
    expect(updated.sessionTracklist.map((track) => track.id)).toEqual([base.trackId, 'a', 'b']);
    expect(updated.sessionTracklist[1]?.reason).toBe('fresh pivot');
    expect(updated.recentlyChangedIds).toEqual(['a', 'b']);
    expect(updated.queueDiffMessage).toBe('2 upcoming tracks updated');
    expect(updated.queueDiffExpiresAtSec).toBe(updated.sessionElapsedSec + 30);
  });

  it('clears queue diff highlights after the TTL', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const updated = playbackReducer(base, {
      type: 'tracklist_updated',
      remaining: [slot('a', 2, 'fresh pivot')],
      changedIds: ['a'],
    });
    expect(updated.recentlyChangedIds).toEqual(['a']);

    let next = updated;
    for (let i = 0; i < 29; i += 1) next = playbackReducer(next, { type: 'tick' });
    expect(next.recentlyChangedIds).toEqual(['a']);
    next = playbackReducer(next, { type: 'tick' });
    expect(next.recentlyChangedIds).toEqual([]);
    expect(next.queueDiffMessage).toBeNull();
    expect(next.queueDiffExpiresAtSec).toBeNull();
  });

  it('does not show queue diff copy when an update leaves the remaining ids unchanged', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const regenerating = playbackReducer(base, { type: 'playlist_feedback', feedback: 'regenerate' });
    const updated = playbackReducer(regenerating, {
      type: 'tracklist_updated',
      remaining: base.sessionTracklist.slice(1),
      beforeRemainingIds: base.remainingTrackIds,
    });
    expect(updated.queueRefreshStatus).toBe('complete');
    expect(updated.recentlyChangedIds).toEqual([]);
    expect(updated.queueDiffMessage).toBeNull();
  });

  it('does not idle while rolling extend is pending (E6)', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const lastTrack = playbackReducer(
      { ...base, remainingTrackIds: [], queueRefreshStatus: 'pending' },
      { type: 'advance' },
    );
    expect(lastTrack.phase).toBe('complete');
    expect(lastTrack.queueRefreshStatus).toBe('pending');
  });

  it('auto-advances when extend lands after the queue was empty (E6)', () => {
    const waiting = playbackReducer(
      playbackReducer(createInitialPlaybackState(), { type: 'start', session: DEMO_SESSION }),
      { type: 'queue_refresh', status: 'pending' },
    );
    const exhausted = playbackReducer({ ...waiting, remainingTrackIds: [], phase: 'complete' }, { type: 'advance' });
    const resumed = playbackReducer(exhausted, {
      type: 'tracklist_updated',
      remaining: [slot('a', 2, 'rolling extend')],
    });
    expect(resumed.phase).toBe('playing');
    expect(resumed.trackId).toBe('a');
    expect(resumed.queueRefreshStatus).toBe('complete');
  });

  it('enters session complete when extend fails on the last track (E6)', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const failed = playbackReducer(
      { ...base, remainingTrackIds: [], queueRefreshStatus: 'error' },
      { type: 'advance' },
    );
    expect(failed.phase).toBe('complete');
    expect(failed.queueRefreshStatus).toBe('error');
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

  it('drops user lines that are only model intent tags', () => {
    const base = playbackReducer(createInitialPlaybackState(), {
      type: 'start',
      session: DEMO_SESSION,
    });
    const next = playbackReducer(base, {
      type: 'transcript',
      role: 'user',
      text: '[casual remark]',
    });
    expect(next.transcript).toHaveLength(0);
    expect(next.userUtteranceCount).toBe(0);
  });
});
