/** One-shot gate: music may preload in parallel but play() waits until open(). */
export interface OpeningGate {
  close(): void;
  open(): void;
  isOpen(): boolean;
  wait(): Promise<void>;
}

export function createOpeningGate(): OpeningGate {
  let open = false;
  const waiters: Array<() => void> = [];

  return {
    close() {
      open = false;
    },
    open() {
      if (open) return;
      open = true;
      for (const w of waiters) w();
      waiters.length = 0;
    },
    isOpen: () => open,
    wait() {
      return open ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
    },
  };
}
