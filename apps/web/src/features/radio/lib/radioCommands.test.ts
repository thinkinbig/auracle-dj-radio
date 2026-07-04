import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioCommands, type RadioCommandDeps } from './radioCommands';
import { postCue } from './sessionApi';
import type { PlaybackAction } from '../session/playbackReducer';
import type { PlaybackState } from '@/features/radio/session/types';

vi.mock('./sessionApi', () => ({ postCue: vi.fn() }));

/** A single ordered log of every effect the command surface produces, across channels. */
type Effect =
  | { ch: 'dispatch'; action: PlaybackAction }
  | { ch: 'bus'; call: 'skipDj' | 'resumeDj' | 'duck' | 'restore' }
  | { ch: 'audio'; call: 'pause' }
  | { ch: 'live'; call: 'sendText'; text: string }
  | { ch: 'opening'; call: 'release' };

function harness(state: Partial<PlaybackState>) {
  const log: Effect[] = [];
  const current = {
    phase: 'playing',
    sessionId: 's1',
    currentTrackIndex: 1,
    remainingTrackIds: ['t2', 't3'],
    ...state,
  } as PlaybackState;

  const deps: RadioCommandDeps = {
    getState: () => current,
    dispatch: (action) => log.push({ ch: 'dispatch', action }),
    getBus: () => ({
      skipDj: () => log.push({ ch: 'bus', call: 'skipDj' }),
      resumeDj: () => log.push({ ch: 'bus', call: 'resumeDj' }),
      setMusicVolume: (v: number) =>
        log.push({ ch: 'bus', call: v < 1 ? 'duck' : 'restore' }),
    }) as never,
    getAudio: () => ({ pause: () => log.push({ ch: 'audio', call: 'pause' }) }) as never,
    getLive: () => ({ sendText: (text: string) => log.push({ ch: 'live', call: 'sendText', text }) }) as never,
    releaseOpening: () => log.push({ ch: 'opening', call: 'release' }),
  };
  return { commands: createRadioCommands(deps), log };
}

beforeEach(() => vi.mocked(postCue).mockClear());

describe('radioCommands.skipTrack', () => {
  it('cuts the DJ turn locally before advancing; no segue cue (the new track breaks at its own end)', () => {
    const { commands, log } = harness({ phase: 'speaking', currentTrackIndex: 1 });
    expect(commands.skipTrack()).toBe(true);

    // The load-bearing order: stop the in-flight turn (local duck), then advance.
    const tags = log.map((e) =>
      e.ch === 'dispatch' ? `dispatch:${e.action.type}` : `${e.ch}:${e.call}`,
    );
    expect(tags).toEqual(['audio:pause', 'bus:skipDj', 'dispatch:advance']);
    expect(postCue).not.toHaveBeenCalled();
  });

  it('skips a non-speaking track without cutting a DJ turn', () => {
    const { commands, log } = harness({ phase: 'playing' });
    expect(commands.skipTrack()).toBe(true);
    expect(log.some((e) => e.ch === 'bus' && e.call === 'skipDj')).toBe(false);
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

describe('radioCommands.cueTrack', () => {
  it('asks the session orchestrator to push the cue for the active session', () => {
    const { commands } = harness({ sessionId: 's1' });
    commands.cueTrack('break');
    expect(postCue).toHaveBeenCalledWith('s1', 'break');
  });

  it('is a no-op without a session', () => {
    const { commands } = harness({ sessionId: null });
    commands.cueTrack('outro');
    expect(postCue).not.toHaveBeenCalled();
  });
});

describe('radioCommands.skipVoiceOver', () => {
  it('cuts the turn, releases opening on track 0, and ends the DJ turn in the reducer', () => {
    const opening = harness({ phase: 'speaking', currentTrackIndex: 0 });
    opening.commands.skipVoiceOver();
    expect(opening.log).toEqual([
      { ch: 'bus', call: 'skipDj' },
      { ch: 'opening', call: 'release' },
      { ch: 'dispatch', action: { type: 'skip_voice_over' } },
    ]);

    const midSet = harness({ phase: 'speaking', currentTrackIndex: 1 });
    midSet.commands.skipVoiceOver();
    expect(midSet.log).toEqual([
      { ch: 'bus', call: 'skipDj' },
      { ch: 'dispatch', action: { type: 'skip_voice_over' } },
    ]);
  });

  it('is a no-op while not speaking', () => {
    const playing = harness({ phase: 'playing' });
    playing.commands.skipVoiceOver();
    expect(playing.log).toEqual([]);
  });
});

describe('radioCommands.sendText', () => {
  it('barges in (cuts the DJ), sends the trimmed text, and echoes it into the transcript', () => {
    const { commands, log } = harness({ phase: 'speaking' });
    commands.sendText('  play something upbeat  ');
    expect(log).toEqual([
      { ch: 'bus', call: 'skipDj' },
      { ch: 'live', call: 'sendText', text: 'play something upbeat' },
      { ch: 'dispatch', action: { type: 'transcript', role: 'user', text: 'play something upbeat' } },
    ]);
  });

  it('is a no-op for blank text or when idle/curating', () => {
    const blank = harness({ phase: 'playing' });
    blank.commands.sendText('   ');
    expect(blank.log).toEqual([]);

    const idle = harness({ phase: 'idle' });
    idle.commands.sendText('hello');
    expect(idle.log).toEqual([]);
  });

  it('sends while paused so the user can type the DJ back on', () => {
    const paused = harness({ phase: 'paused' });
    paused.commands.sendText('play it');
    expect(paused.log).toEqual([
      { ch: 'bus', call: 'skipDj' },
      { ch: 'live', call: 'sendText', text: 'play it' },
      { ch: 'dispatch', action: { type: 'transcript', role: 'user', text: 'play it' } },
    ]);
  });
});
