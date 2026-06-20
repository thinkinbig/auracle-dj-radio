import { useReducer, useState } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import {
  createInitialPlaybackState,
  playbackReducer,
} from './playbackReducer';
import type { PlaybackState } from '@/features/radio/session/types';
import { useLiveConnection } from '../effects/useLiveConnection';
import { useOpeningGate } from '../effects/useOpeningGate';
import { useRadioCommands } from '../effects/useRadioCommands';
import { useRadioHandlers } from '../effects/useRadioHandlers';
import { useSessionClock } from '../effects/useSessionClock';
import { useSessionRefs } from '../effects/useSessionRefs';
import { useTalkWindow } from '../effects/useTalkWindow';
import { useTrackPlayback } from '../effects/useTrackPlayback';

export interface RadioSession {
  state: PlaybackState;
  analyser: AnalyserNode | null;
  /** Mic-input spectrum, used by the waveform while the listener holds the floor. */
  micAnalyser: AnalyserNode | null;
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handleTalkStart: () => void;
  handleTalkEnd: () => void;
  handleSendText: (text: string) => void;
}

/** Composes radio effect hooks around a single playback reducer. */
export function useRadioSession(): RadioSession {
  const [state, dispatch] = useReducer(playbackReducer, undefined, createInitialPlaybackState);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const { store, audio, live } = useSessionRefs(state, dispatch);

  const opening = useOpeningGate(store, audio);
  const commands = useRadioCommands(store, audio, live, opening);

  useTrackPlayback({
    store,
    audio,
    commands,
    state: {
      phase: state.phase,
      currentTrackIndex: state.currentTrackIndex,
      sessionId: state.sessionId,
      trackId: state.trackId,
      remainingTrackIds: state.remainingTrackIds,
      isTalking: state.isTalking,
    },
    opening,
  });

  useLiveConnection({
    store,
    audio,
    live,
    commands,
    proxyUrl: state.proxyUrl,
    sessionId: state.sessionId,
    token: state.token,
    phase: state.phase,
    isTalking: state.isTalking,
    opening,
    setMicAnalyser,
  });

  useTalkWindow(store, state.phase, state.inBreak, state.userUtteranceCount);
  useSessionClock(state.phase, dispatch);

  const handlers = useRadioHandlers({ store, audio, commands, setAnalyser });

  return {
    state,
    analyser,
    micAnalyser,
    handleStart: handlers.handleStart,
    handleTogglePause: handlers.handleTogglePause,
    handleSkipTrack: handlers.handleSkipTrack,
    handleSkipDj: handlers.handleSkipDj,
    handleContinue: handlers.handleContinue,
    handleChangeHostMode: handlers.handleChangeHostMode,
    handleTalkStart: handlers.handleTalkStart,
    handleTalkEnd: handlers.handleTalkEnd,
    handleSendText: handlers.handleSendText,
  };
}
