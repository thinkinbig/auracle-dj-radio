import { createContext, useContext, type ReactNode } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import { useRadioSession } from './useRadioSession';
import type { PlaybackState, PlaylistFeedback } from '@/features/radio/session/types';

export interface RadioActions {
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleReturnToSetup: () => void;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handlePlaylistFeedback: (feedback: PlaylistFeedback) => void;
  handleRetryExtend: () => void;
  handleSendText: (text: string) => void;
}

interface RadioSessionContextValue {
  state: PlaybackState;
  analyser: AnalyserNode | null;
  micAnalyser: AnalyserNode | null;
  actions: RadioActions;
}

const RadioSessionContext = createContext<RadioSessionContextValue | null>(null);

export function RadioSessionProvider({
  children,
  onAuthExpired,
}: {
  children: ReactNode;
  onAuthExpired?: () => void;
}) {
  const session = useRadioSession(onAuthExpired);
  const value: RadioSessionContextValue = {
    state: session.state,
    analyser: session.analyser,
    micAnalyser: session.micAnalyser,
    actions: {
      handleStart: session.handleStart,
      handleReturnToSetup: session.handleReturnToSetup,
      handleTogglePause: session.handleTogglePause,
      handleSkipTrack: session.handleSkipTrack,
      handleSkipDj: session.handleSkipDj,
      handleContinue: session.handleContinue,
      handleChangeHostMode: session.handleChangeHostMode,
      handlePlaylistFeedback: session.handlePlaylistFeedback,
      handleRetryExtend: session.handleRetryExtend,
      handleSendText: session.handleSendText,
    },
  };
  return <RadioSessionContext.Provider value={value}>{children}</RadioSessionContext.Provider>;
}

function useRadioSessionContext(): RadioSessionContextValue {
  const ctx = useContext(RadioSessionContext);
  if (!ctx) {
    throw new Error('Radio session hooks must be used within RadioSessionProvider');
  }
  return ctx;
}

export function useRadioState(): PlaybackState {
  return useRadioSessionContext().state;
}

export function useRadioAnalyser(): AnalyserNode | null {
  return useRadioSessionContext().analyser;
}

export function useRadioMicAnalyser(): AnalyserNode | null {
  return useRadioSessionContext().micAnalyser;
}

export function useRadioActions(): RadioActions {
  return useRadioSessionContext().actions;
}
