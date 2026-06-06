import { useRef } from 'react';
import type { Dispatch } from 'react';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { PlaybackState } from '../../types';
import type { SessionRefs } from './sessionRefs';

/** Stable ref bundle; dispatch/state pointers are refreshed each render by the caller. */
export function useSessionRefs(
  state: PlaybackState,
  dispatch: Dispatch<PlaybackAction>,
): SessionRefs {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const stateRef = useRef(state);
  stateRef.current = state;

  const liveRef = useRef<SessionRefs['liveRef']['current']>(null);
  const audioRef = useRef<SessionRefs['audioRef']['current']>(null);
  const audioBusRef = useRef<SessionRefs['audioBusRef']['current']>(null);
  const skipGuardRef = useRef(false);
  const preloadRef = useRef<SessionRefs['preloadRef']['current']>(null);
  const openingRef = useRef<SessionRefs['openingRef']['current']>(null);

  const bundleRef = useRef<SessionRefs | null>(null);
  if (!bundleRef.current) {
    bundleRef.current = {
      dispatchRef,
      stateRef,
      liveRef,
      audioRef,
      audioBusRef,
      skipGuardRef,
      preloadRef,
      openingRef,
    };
  }
  return bundleRef.current;
}
