import { OPENING_GATE_TIMEOUT_MS } from './playbackCoordinator';
import { createOpeningGate, type OpeningGate } from './openingGate';

/** Manages opening gate + timeout; calls onRelease once when the opening slot unblocks. */
export interface OpeningController {
  armForTrack(trackIndex: number): OpeningGate | null;
  release(): void;
  isReleased(): boolean;
  dispose(): void;
  wait(): Promise<void>;
}

export function createOpeningController(onRelease: () => void): OpeningController {
  let gate: OpeningGate | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let released = true;

  function clearTimeoutId(): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function release(): void {
    if (released) return;
    released = true;
    gate?.open();
    clearTimeoutId();
    onRelease();
  }

  return {
    armForTrack(trackIndex: number) {
      clearTimeoutId();
      if (trackIndex !== 0) {
        gate = null;
        released = true;
        return null;
      }
      released = false;
      gate = createOpeningGate();
      timeoutId = setTimeout(release, OPENING_GATE_TIMEOUT_MS);
      return gate;
    },
    release,
    isReleased: () => released,
    dispose: clearTimeoutId,
    wait() {
      return gate?.wait() ?? Promise.resolve();
    },
  };
}
