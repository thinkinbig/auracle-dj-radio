import type { ServerMessage } from '@auracle/shared';
import { decodeServerFrame } from './rtcProtocol';

export interface LiveRtcOptions {
  /** Proxy base URL (memory-service POST /sessions → proxy_url). */
  proxyUrl: string;
  /** Orchestrator-minted session id; the proxy adopts it via X-Session-ID. */
  sessionId: string;
  /** Registration token; sent for proxy-side auth (not yet verified server-side). */
  token?: string;
  /**
   * The user's login token (same as `POST /sessions`). Sent as Authorization:
   * Bearer so the proxy can bind this media session to the user (issue #55).
   */
  authToken?: string;
  /** Provider query param; the live DJ is gemini. */
  model?: string;
  /** Optional explicit mic device id. */
  deviceId?: string;
}

export interface LiveRtcHandlers {
  onMessage(msg: ServerMessage): void;
  /** The DJ's remote audio (Opus) — attach to an <audio> element / audio bus. */
  onRemoteStream(stream: MediaStream): void;
  /** The captured mic stream — tap it for the waveform analyser. */
  onLocalStream?(stream: MediaStream): void;
  /** Fires once the peer connection reaches "connected". */
  onOpen?(): void;
  /** Fires on remote close, connection failure, or close(). */
  onClose?(): void;
}

export interface LiveRtcHandle {
  /** Send raw user text to the model over the data channel. */
  sendText(text: string): void;
  /**
   * Gate the mic track without renegotiating: the WebRTC port of the relay-era
   * phase-gated PCM mute (anti-echo while the DJ speaks on speakers).
   */
  setMicEnabled(on: boolean): void;
  close(): void;
}

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
};

function offerUrl(proxyUrl: string, model: string): string {
  return `${proxyUrl.replace(/\/$/, '')}/?model=${encodeURIComponent(model)}`;
}

const MAX_PENDING_TEXT_MESSAGES = 20;

interface TextDataChannel {
  readonly readyState: RTCDataChannelState;
  send(text: string): void;
  addEventListener(type: 'open', listener: () => void): void;
}

export function createBufferedTextSender(dc: TextDataChannel): (text: string) => void {
  const pending: string[] = [];

  const flush = () => {
    if (dc.readyState !== 'open') return;
    const batch = pending.splice(0);
    for (const text of batch) dc.send(text);
  };

  dc.addEventListener('open', flush);

  return (text: string) => {
    if (dc.readyState === 'open') {
      dc.send(text);
      return;
    }
    if (dc.readyState !== 'connecting') return;
    if (pending.length >= MAX_PENDING_TEXT_MESSAGES) pending.shift();
    pending.push(text);
  };
}

/**
 * Establish the live DJ session directly with the proxy over WebRTC. The
 * memory-service is never in the media path: it has already pushed the session
 * registration, so the proxy adopts `sessionId` from X-Session-ID and assembles
 * the Gemini contract (refactor-three-services: push context, direct media).
 */
export async function connectLiveSessionRtc(
  opts: LiveRtcOptions,
  handlers: LiveRtcHandlers,
): Promise<LiveRtcHandle> {
  const model = opts.model ?? 'gemini';
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: opts.deviceId ? { ...MIC_CONSTRAINTS, deviceId: { exact: opts.deviceId } } : MIC_CONSTRAINTS,
  });
  handlers.onLocalStream?.(localStream);

  const pc = new RTCPeerConnection({}); // no ICE servers — host candidates only
  const dc = pc.createDataChannel('data', { ordered: true });
  const sendText = createBufferedTextSender(dc);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      dc.close();
    } catch {
      /* already closed */
    }
    try {
      pc.close();
    } catch {
      /* already closed */
    }
    localStream.getTracks().forEach((t) => t.stop());
    handlers.onClose?.();
  };

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') handlers.onOpen?.();
    else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') cleanup();
  });
  pc.addEventListener('track', (evt) => {
    const stream = evt.streams[0];
    if (stream) handlers.onRemoteStream(stream);
  });
  dc.addEventListener('message', (e) => {
    const raw = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
    const msg = decodeServerFrame(raw);
    if (msg) handlers.onMessage(msg);
  });

  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const headers: Record<string, string> = {
    'Content-Type': 'application/sdp',
    'X-Session-ID': opts.sessionId,
  };
  if (opts.token) headers['X-Session-Token'] = opts.token;
  if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;

  let resp: Response;
  try {
    resp = await fetch(offerUrl(opts.proxyUrl, model), { method: 'POST', headers, body: offer.sdp ?? '' });
  } catch (err) {
    cleanup();
    throw err;
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    cleanup();
    throw new Error(`proxy offer ${resp.status}: ${detail}`);
  }
  const answer = await resp.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });

  return {
    sendText,
    setMicEnabled(on) {
      for (const track of localStream.getAudioTracks()) track.enabled = on;
    },
    close: cleanup,
  };
}
