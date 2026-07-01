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
 * memory-service's view of the media proxy (rt_llm_proxy). Injected so session
 * creation is testable without a running proxy. memory-service pushes the
 * pre-baked registration before the browser connects (refactor-three-services:
 * push context, direct media), and later injects async business updates (Lane 3).
 */
export interface ProxyClient {
  register(sessionId: string, token: string, reg: ProxyRegistration): Promise<void>;
  inject(sessionId: string, payload: InjectPayload): Promise<void>;
}

/** HTTP-backed client: POST {proxyUrl}/session/{id}/{register,inject}. */
export class HttpProxyClient implements ProxyClient {
  constructor(private readonly baseUrl: string) {}

  async register(sessionId: string, token: string, reg: ProxyRegistration): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
      headers: { "content-type": "application/json" },
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
