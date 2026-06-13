import type { ServerMessage } from '@auracle/shared';

/**
 * Browser-side mirror of the proxy's data-channel wire contract (Go
 * internal/rtc/dcproto). The proxy sends three outbound shapes; this classifies
 * each into one ServerMessage, or null to ignore:
 *   - transcript line: bare {seq?, role, text} with NO type tag.
 *   - ui event:        {type:"ui_event", event:<ServerMessage>} — business
 *     side-effects from a server-side tool call (Lane 1) or async push (Lane 3).
 *   - tool call:       {type:"tool_call",...} — ignored; tools run server-side.
 *
 * Outbound now_playing/host-mode/events do NOT go over this channel: the proxy
 * feeds any non-tool-result text straight to the model as user speech, so those
 * are posted directly to memory-service over HTTP (refactor-three-services).
 */
export function decodeServerFrame(raw: string): ServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // Lane-1/Lane-3 ui event: the inner event is already a ServerMessage.
  if (obj.type === 'ui_event') {
    const event = obj.event;
    if (event && typeof event === 'object' && typeof (event as { type?: unknown }).type === 'string') {
      return event as ServerMessage;
    }
    return null;
  }

  // Tool calls/results are server-side now; the browser does not handle them.
  if (obj.type === 'tool_call' || obj.type === 'tool_result') return null;

  // Bare transcript line: keyed by role + text, no type tag.
  if (typeof obj.role === 'string' && typeof obj.text === 'string') {
    return { type: 'transcript', role: obj.role === 'user' ? 'user' : 'model', text: obj.text };
  }

  return null;
}
