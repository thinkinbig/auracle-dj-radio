import { describe, expect, it } from 'vitest';
import { createBufferedTextSender } from './liveSessionRtc';

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  sent: string[] = [];
  private readonly openListeners: Array<() => void> = [];

  send(text: string): void {
    this.sent.push(text);
  }

  addEventListener(type: 'open', listener: () => void): void {
    if (type === 'open') this.openListeners.push(listener);
  }

  open(): void {
    this.readyState = 'open';
    for (const listener of this.openListeners) listener();
  }
}

describe('createBufferedTextSender', () => {
  it('queues text while the data channel is connecting and flushes it on open', () => {
    const dc = new FakeDataChannel();
    const sendText = createBufferedTextSender(dc);

    sendText('first');
    sendText('second');
    expect(dc.sent).toEqual([]);

    dc.open();
    expect(dc.sent).toEqual(['first', 'second']);

    sendText('third');
    expect(dc.sent).toEqual(['first', 'second', 'third']);
  });

  it('drops text once the data channel is closing or closed', () => {
    const dc = new FakeDataChannel();
    const sendText = createBufferedTextSender(dc);

    dc.readyState = 'closed';
    sendText('lost');

    expect(dc.sent).toEqual([]);
  });
});
