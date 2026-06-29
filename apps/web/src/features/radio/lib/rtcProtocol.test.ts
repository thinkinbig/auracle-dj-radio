import { describe, expect, it } from 'vitest';
import { decodeServerFrame } from './rtcProtocol';

describe('decodeServerFrame', () => {
  it('maps a bare transcript line to a transcript message', () => {
    expect(decodeServerFrame('{"seq":7,"role":"model","text":"hello"}')).toEqual({
      type: 'transcript',
      role: 'model',
      text: 'hello',
    });
    // An unknown role normalizes to "model" (only user|model exist).
    expect(decodeServerFrame('{"role":"weird","text":"x"}')).toEqual({
      type: 'transcript',
      role: 'model',
      text: 'x',
    });
  });

  it('unwraps a ui_event envelope to its inner ServerMessage', () => {
    expect(
      decodeServerFrame('{"type":"ui_event","event":{"type":"intent","intent":{"type":"skip_track"}}}'),
    ).toEqual({ type: 'intent', intent: { type: 'skip_track' } });

    expect(
      decodeServerFrame(
        '{"type":"ui_event","event":{"type":"tracklist_updated","remaining":[{"id":"a","flow_position":1,"reason":"x"}]}}',
      ),
    ).toEqual({ type: 'tracklist_updated', remaining: [{ id: 'a', flow_position: 1, reason: 'x' }] });

    // Session-switch teardown signal (issue #55) rides the same ui_event lane.
    expect(decodeServerFrame('{"type":"ui_event","event":{"type":"session_superseded"}}')).toEqual({
      type: 'session_superseded',
    });

    expect(
      decodeServerFrame('{"type":"ui_event","event":{"type":"queue_refresh","status":"pending"}}'),
    ).toEqual({ type: 'queue_refresh', status: 'pending' });
  });

  it('ignores tool calls/results (server-side now) and malformed frames', () => {
    expect(decodeServerFrame('{"type":"tool_call","id":"a","name":"skip_track","args":{}}')).toBeNull();
    expect(decodeServerFrame('{"type":"tool_result","id":"a"}')).toBeNull();
    expect(decodeServerFrame('{"type":"ui_event"}')).toBeNull(); // no inner event
    expect(decodeServerFrame('not json')).toBeNull();
    expect(decodeServerFrame('42')).toBeNull();
    expect(decodeServerFrame('{"foo":"bar"}')).toBeNull();
  });
});
