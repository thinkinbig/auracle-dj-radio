import type { ClientMessage, Phase, ServerMessage } from '@auracle/shared';

export interface LiveSessionHandle {
  /** Send a JSON client frame; buffered until the socket opens. */
  send(msg: ClientMessage): void;
  /** Send a raw mic PCM frame; dropped if the socket isn't open yet. */
  sendAudio(pcm: ArrayBuffer): void;
  close(): void;
}

export interface LiveSessionHandlers {
  onMessage(msg: ServerMessage): void;
  /** Raw DJ voice PCM frames (24kHz s16le mono). */
  onAudio(pcm: ArrayBuffer): void;
  /** Fires when the browser WebSocket is open (safe to send cue_dj). */
  onOpen?: () => void;
  /** Fires when the browser WebSocket closes (remote close or network fault). */
  onClose?: () => void;
}

export function toWebSocketUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Open Live WS; returns a handle to send frames / close. JSON frames are control, binary is PCM. */
export function connectLiveSession(
  liveWsPath: string,
  handlers: LiveSessionHandlers,
): LiveSessionHandle {
  const ws = new WebSocket(toWebSocketUrl(liveWsPath));
  ws.binaryType = 'arraybuffer';

  // The opening cue_dj is sent before onopen fires; buffer until the socket is ready.
  const pending: ClientMessage[] = [];
  ws.onopen = () => {
    for (const msg of pending) ws.send(JSON.stringify(msg));
    pending.length = 0;
    handlers.onOpen?.();
  };
  ws.onclose = () => handlers.onClose?.();

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      handlers.onAudio(ev.data as ArrayBuffer);
      return;
    }
    try {
      handlers.onMessage(JSON.parse(ev.data) as ServerMessage);
    } catch {
      /* ignore malformed frames */
    }
  };

  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else pending.push(msg);
    },
    sendAudio(pcm) {
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
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
