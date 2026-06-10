import { useReducer, useState } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import {
  createInitialPlaybackState,
  playbackReducer,
} from '../lib/playbackReducer';
import type { PlaybackState } from '../types';
import { useLiveConnection } from './radio/useLiveConnection';
import { useMicStream } from './radio/useMicStream';
import { useOpeningGate } from './radio/useOpeningGate';
import { useRadioCommands } from './radio/useRadioCommands';
import { useRadioHandlers } from './radio/useRadioHandlers';
import { useSessionClock } from './radio/useSessionClock';
import { useSessionRefs } from './radio/useSessionRefs';
import { useTalkWindow } from './radio/useTalkWindow';
import { useTrackPlayback } from './radio/useTrackPlayback';

export interface RadioSession {
  state: PlaybackState;
  analyser: AnalyserNode | null;
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handleTalkStart: () => void;
  handleTalkEnd: () => void;
}

/** Composes radio effect hooks around a single playback reducer. */
export function useRadioSession(): RadioSession {
  const [state, dispatch] = useReducer(playbackReducer, undefined, createInitialPlaybackState);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const { store, audio, live } = useSessionRefs(state, dispatch);

  const opening = useOpeningGate(store, audio);
  const commands = useRadioCommands(store, audio, live, opening);

  useTrackPlayback({
    store,
    audio,
    live,
    commands,
    state: {
      phase: state.phase,
      currentTrackIndex: state.currentTrackIndex,
      sessionId: state.sessionId,
      trackId: state.trackId,
      remainingTrackIds: state.remainingTrackIds,
    },
    opening,
  });

  useLiveConnection({
    store,
    audio,
    live,
    commands,
    liveWsUrl: state.liveWsUrl,
    opening,
  });

  useMicStream(store, live, state.sessionId);
  useTalkWindow(store, state.phase, state.inBreak, state.userUtteranceCount);
  useSessionClock(state.phase, dispatch);

  const handlers = useRadioHandlers({ store, audio, commands, setAnalyser });

  return {
    state,
    analyser,
    handleStart: handlers.handleStart,
    handleTogglePause: handlers.handleTogglePause,
    handleSkipTrack: handlers.handleSkipTrack,
    handleSkipDj: handlers.handleSkipDj,
    handleContinue: handlers.handleContinue,
    handleChangeHostMode: handlers.handleChangeHostMode,
    handleTalkStart: handlers.handleTalkStart,
    handleTalkEnd: handlers.handleTalkEnd,
  };
}
