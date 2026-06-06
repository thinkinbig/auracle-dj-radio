import { createContext, useContext, type ReactNode } from 'react';
import type { HostMode } from '@auracle/shared';
import { useRadioSession } from '../hooks/useRadioSession';
import type { PlaybackState } from '../types';

export interface RadioActions {
  handleStart: () => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
}

interface RadioSessionContextValue {
  state: PlaybackState;
  analyser: AnalyserNode | null;
  actions: RadioActions;
}

const RadioSessionContext = createContext<RadioSessionContextValue | null>(null);

export function RadioSessionProvider({ children }: { children: ReactNode }) {
  const session = useRadioSession();
  const value: RadioSessionContextValue = {
    state: session.state,
    analyser: session.analyser,
    actions: {
      handleStart: session.handleStart,
      handleTogglePause: session.handleTogglePause,
      handleSkipTrack: session.handleSkipTrack,
      handleSkipDj: session.handleSkipDj,
      handleChangeHostMode: session.handleChangeHostMode,
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

export function useRadioActions(): RadioActions {
  return useRadioSessionContext().actions;
}
