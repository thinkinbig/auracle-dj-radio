import { describe, expect, it } from 'vitest';
import type { ClientMessage } from '@auracle/shared';
import { createRadioCommands, type RadioCommandDeps } from './radioCommands';
import type { PlaybackAction } from './playbackReducer';
import type { PlaybackState } from '../types';

/** A single ordered log of every effect the command surface produces, across channels. */
type Effect =
  | { ch: 'socket'; msg: ClientMessage }
  | { ch: 'dispatch'; action: PlaybackAction }
  | { ch: 'bus'; call: 'skipDj' | 'duck' | 'restore' }
  | { ch: 'audio'; call: 'pause' }
  | { ch: 'opening'; call: 'release' };

function harness(state: Partial<PlaybackState>) {
  const log: Effect[] = [];
  const current = {
    phase: 'playing',
    sessionId: 's1',
    currentTrackIndex: 1,
    remainingTrackIds: ['t2', 't3'],
    isTalking: false,
    ...state,
  } as PlaybackState;

  const deps: RadioCommandDeps = {
    getState: () => current,
    dispatch: (action) => log.push({ ch: 'dispatch', action }),
    getBus: () => ({
      skipDj: () => log.push({ ch: 'bus', call: 'skipDj' }),
      setMusicVolume: (v: number) =>
        log.push({ ch: 'bus', call: v < 1 ? 'duck' : 'restore' }),
    }) as never,
    getSocket: () => ({ send: (msg: ClientMessage) => log.push({ ch: 'socket', msg }) }) as never,
    getAudio: () => ({ pause: () => log.push({ ch: 'audio', call: 'pause' }) }) as never,
    releaseOpening: () => log.push({ ch: 'opening', call: 'release' }),
  };
  return { commands: createRadioCommands(deps), log };
}

describe('radioCommands.skipTrack', () => {
  it('cuts the DJ turn before advancing, then cues the next track', () => {
    const { commands, log } = harness({ phase: 'speaking', currentTrackIndex: 1 });
    expect(commands.skipTrack()).toBe(true);

    // The load-bearing order: stop the in-flight turn, advance the Playhead, then
    // cue the next track (whose index is the pre-advance snapshot + 1).
    const tags = log.map((e) =>
      e.ch === 'socket' ? `socket:${e.msg.type}` : e.ch === 'dispatch' ? `dispatch:${e.action.type}` : `${e.ch}:${e.call}`,
    );
    expect(tags).toEqual([
      'audio:pause',
      'bus:skipDj',
      'socket:skip_dj',
      'dispatch:advance',
      'socket:cue_dj',
    ]);
    const cue = log.find((e) => e.ch === 'socket' && e.msg.type === 'cue_dj');
    expect(cue).toMatchObject({ msg: { track_index: 2, kind: undefined } });
  });

  it('skips a non-speaking track without cutting a DJ turn', () => {
    const { commands, log } = harness({ phase: 'playing' });
    expect(commands.skipTrack()).toBe(true);
    expect(log.some((e) => e.ch === 'bus' && e.call === 'skipDj')).toBe(false);
    expect(log.some((e) => e.ch === 'socket' && e.msg.type === 'skip_dj')).toBe(false);
    expect(log.some((e) => e.ch === 'dispatch' && e.action.type === 'advance')).toBe(true);
  });

  it('releases the opening gate when skipping the opening track', () => {
    const { commands, log } = harness({ phase: 'speaking', currentTrackIndex: 0 });
    commands.skipTrack();
    expect(log.some((e) => e.ch === 'opening')).toBe(true);
  });

  it('does nothing with no session, nothing remaining, or before playback', () => {
    for (const bad of [{ sessionId: null }, { remainingTrackIds: [] }, { phase: 'idle' as const }]) {
      const { commands, log } = harness(bad);
      expect(commands.skipTrack()).toBe(false);
      expect(log).toEqual([]);
    }
  });

  it('arms the skip guard exactly once', () => {
    const { commands } = harness({ phase: 'playing' });
    commands.skipTrack();
    expect(commands.consumeSkipGuard()).toBe(true);
    expect(commands.consumeSkipGuard()).toBe(false);
  });
});

describe('radioCommands.skipVoiceOver', () => {
  it('cuts the turn only while the DJ is speaking', () => {
    const speaking = harness({ phase: 'speaking' });
    speaking.commands.skipVoiceOver();
    expect(speaking.log.map((e) => (e.ch === 'socket' ? e.msg.type : e.ch))).toEqual(['bus', 'skip_dj']);

    const playing = harness({ phase: 'playing' });
    playing.commands.skipVoiceOver();
    expect(playing.log).toEqual([]);
  });
});

describe('radioCommands.talk', () => {
  it('ducks on start and restores on end', () => {
    const { commands, log } = harness({ phase: 'playing', isTalking: false });
    commands.startTalk();
    expect(log).toEqual([
      { ch: 'bus', call: 'duck' },
      { ch: 'dispatch', action: { type: 'start_talk' } },
    ]);

    const ending = harness({ isTalking: true });
    ending.commands.endTalk();
    expect(ending.log).toEqual([
      { ch: 'bus', call: 'restore' },
      { ch: 'dispatch', action: { type: 'stop_talk' } },
    ]);
  });

  it('ignores startTalk when paused or already talking', () => {
    const paused = harness({ phase: 'paused' });
    paused.commands.startTalk();
    expect(paused.log).toEqual([]);
  });
});
