import { describe, expect, it } from 'vitest';
import { createOpeningGate } from './openingGate';

describe('createOpeningGate', () => {
  it('blocks wait until open', async () => {
    const gate = createOpeningGate();
    let released = false;
    void gate.wait().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    gate.open();
    await Promise.resolve();
    expect(released).toBe(true);
  });
});
