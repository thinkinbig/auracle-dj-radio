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
  const refs = useSessionRefs(state, dispatch);

  const opening = useOpeningGate(refs);

  useTrackPlayback({
    refs,
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
    refs,
    liveWsUrl: state.liveWsUrl,
    opening,
  });

  useMicStream(refs, state.sessionId);
  useTalkWindow(refs, state.phase, state.inBreak, state.userUtteranceCount);
  useSessionClock(state.phase, dispatch);

  const handlers = useRadioHandlers({ refs, dispatch, opening, setAnalyser });

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
