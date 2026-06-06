import type { Phase, ServerMessage } from '@auracle/shared';

export function toWebSocketUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Open Live WS; returns cleanup. JSON frames only — PCM handled in a later slice. */
export function connectLiveSession(
  liveWsPath: string,
  onMessage: (msg: ServerMessage) => void,
): () => void {
  const ws = new WebSocket(toWebSocketUrl(liveWsPath));
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    try {
      onMessage(JSON.parse(ev.data) as ServerMessage);
    } catch {
      /* ignore malformed frames */
    }
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
}

export function mapServerPhase(phase: Phase): 'speaking' | 'listening' | 'playing' | null {
  switch (phase) {
    case 'dj_turn_start':
      return 'speaking';
    case 'dj_turn_end':
      return 'playing';
    case 'user_barge_in':
      return 'listening';
    case 'user_barge_end':
      return 'speaking';
    default:
      return null;
  }
}
