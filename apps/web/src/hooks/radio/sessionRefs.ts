import type { Dispatch, MutableRefObject } from 'react';
import type { AudioBus } from '../../lib/liveAudio';
import type { LiveSessionHandle } from '../../lib/liveSession';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { PlaybackState } from '../../types';

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

/** Transport: the live WebSocket handle to the relay. */
export interface LiveRefs {
  liveRef: MutableRefObject<LiveSessionHandle | null>;
}

/** The three imperative seams, grouped by plane; hooks take only the ones they need. */
export interface SessionRefs {
  store: StoreRefs;
  audio: AudioRefs;
  live: LiveRefs;
}
