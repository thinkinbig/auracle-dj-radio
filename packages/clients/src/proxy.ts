import type { ServerMessage } from "@auracle/shared";

/** Lane-3 async push body: an optional text nudge + browser ui events. */
export interface InjectPayload {
  inject_text?: string;
  ui_events?: ServerMessage[];
}

/** Pre-baked registration the harness hands the proxy at session start. */
export interface ProxyRegistration {
  systemInstruction: string;
  tools: unknown[];
  openingCue: string;
}

/**
 * Agent-harness view of the media proxy (rt_llm_proxy). Injected so session
 * creation is testable without a running proxy.
 */
export interface ProxyClient {
  register(sessionId: string, token: string, reg: ProxyRegistration): Promise<void>;
  inject(sessionId: string, payload: InjectPayload): Promise<void>;
}

/** HTTP-backed client: POST {proxyUrl}/session/{id}/{register,inject}. */
export class HttpProxyClient implements ProxyClient {
  constructor(
    private readonly baseUrl: string,
    /** Shared secret for register/inject when the proxy sets PROXY_REGISTER_SECRET. */
    private readonly registerSecret?: string,
  ) {}

  private internalHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.registerSecret) {
      headers.authorization = `Bearer ${this.registerSecret}`;
    }
    return headers;
  }

  async register(sessionId: string, token: string, reg: ProxyRegistration): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}/register`, {
      method: "POST",
      headers: this.internalHeaders(),
      body: JSON.stringify({
        token,
        systemInstruction: reg.systemInstruction,
        tools: reg.tools,
        openingCue: reg.openingCue,
      }),
    });
    if (!res.ok) throw new Error(`proxy register ${sessionId}: ${res.status} ${await res.text()}`);
  }

  async inject(sessionId: string, payload: InjectPayload): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}/inject`, {
      method: "POST",
      headers: this.internalHeaders(),
      body: JSON.stringify({
        inject_text: payload.inject_text ?? "",
        ui_events: payload.ui_events ?? [],
      }),
    });
    // A 404 means the session ended before the async update landed — expected,
    // not a failure (mirrors the proxy's "miss is normal" semantics).
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`proxy inject ${sessionId}: ${res.status} ${await res.text()}`);
  }
}
