import { useRef } from 'react';
import type { Dispatch } from 'react';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { PlaybackState } from '../../types';
import type { AudioRefs, LiveRefs, SessionRefs, StoreRefs } from './sessionRefs';

/** Stable seam bundles; the store's dispatch/state pointers are refreshed each render. */
export function useSessionRefs(
  state: PlaybackState,
  dispatch: Dispatch<PlaybackAction>,
): SessionRefs {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const stateRef = useRef(state);
  stateRef.current = state;

  const audioRef = useRef<AudioRefs['audioRef']['current']>(null);
  const audioBusRef = useRef<AudioRefs['audioBusRef']['current']>(null);
  const liveRef = useRef<LiveRefs['liveRef']['current']>(null);

  const bundleRef = useRef<SessionRefs | null>(null);
  if (!bundleRef.current) {
    const store: StoreRefs = { dispatchRef, stateRef };
    const audio: AudioRefs = { audioRef, audioBusRef };
    const live: LiveRefs = { liveRef };
    bundleRef.current = { store, audio, live };
  }
  return bundleRef.current;
}
