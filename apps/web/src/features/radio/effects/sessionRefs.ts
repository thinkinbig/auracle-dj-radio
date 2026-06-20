import type { Dispatch, MutableRefObject } from 'react';
import type { AudioBus } from '../lib/liveAudio';
import type { LiveRtcHandle } from '../lib/liveSessionRtc';
import type { PlaybackAction } from '../session/playbackReducer';
import type { PlaybackState } from '@/features/radio/session/types';

/** Control-plane access: read the latest state, write actions. */
export interface StoreRefs {
  dispatchRef: MutableRefObject<Dispatch<PlaybackAction>>;
  stateRef: MutableRefObject<PlaybackState>;
}

/** Data plane: the music element and the WebAudio bus that plays DJ voice + music. */
export interface AudioRefs {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  audioBusRef: MutableRefObject<AudioBus | null>;
}

/** Transport: the WebRTC session handle to the proxy. */
export interface LiveRefs {
  liveRef: MutableRefObject<LiveRtcHandle | null>;
}

/** The three imperative seams, grouped by plane; hooks take only the ones they need. */
export interface SessionRefs {
  store: StoreRefs;
  audio: AudioRefs;
  live: LiveRefs;
}
