import { describe, expect, it, vi } from 'vitest';
import { connectLiveSession } from './liveSession';

describe('connectLiveSession', () => {
  it('invokes onClose when websocket closes', () => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.OPEN;
      binaryType: BinaryType = 'blob';
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      send = vi.fn();
      close = vi.fn(() => {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.();
      });
      constructor(_url: string) {}
    }

    const original = globalThis.WebSocket;
    (globalThis as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const onClose = vi.fn();
    const handle = connectLiveSession('ws://localhost/live/ws/test', {
      onMessage: () => {},
      onAudio: () => {},
      onClose,
    });
    handle.close();
    expect(onClose).toHaveBeenCalledTimes(1);

    (globalThis as { WebSocket: typeof WebSocket }).WebSocket = original;
  });
});
