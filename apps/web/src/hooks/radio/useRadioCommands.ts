import { useRef } from 'react';
import { createRadioCommands, type RadioCommands } from '../../lib/radioCommands';
import type { OpeningGateControls } from './useOpeningGate';
import type { AudioRefs, StoreRefs } from './sessionRefs';

/** Create the single long-lived command surface, reading the bus/audio lazily from refs. */
export function useRadioCommands(
  store: StoreRefs,
  audio: AudioRefs,
  opening: Pick<OpeningGateControls, 'releaseOpening'>,
): RadioCommands {
  const ref = useRef<RadioCommands | null>(null);
  if (!ref.current) {
    ref.current = createRadioCommands({
      getState: () => store.stateRef.current,
      dispatch: (action) => store.dispatchRef.current(action),
      getBus: () => audio.audioBusRef.current,
      getAudio: () => audio.audioRef.current,
      releaseOpening: () => opening.releaseOpening(),
    });
  }
  return ref.current;
}
