import type { Dispatch, MutableRefObject } from 'react';
import type { AudioBus } from '../../lib/liveAudio';
import type { OpeningController } from '../../lib/openingController';
import type { LiveSessionHandle } from '../../lib/liveSession';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { PlaybackState } from '../../types';

/** Imperative handles shared across radio effect hooks. */
export interface SessionRefs {
  dispatchRef: MutableRefObject<Dispatch<PlaybackAction>>;
  stateRef: MutableRefObject<PlaybackState>;
  liveRef: MutableRefObject<LiveSessionHandle | null>;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  audioBusRef: MutableRefObject<AudioBus | null>;
  skipGuardRef: MutableRefObject<boolean>;
  preloadRef: MutableRefObject<HTMLAudioElement | null>;
  openingRef: MutableRefObject<OpeningController | null>;
}
