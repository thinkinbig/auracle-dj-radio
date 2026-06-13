import type { Registration } from "./dj/registration.js";

/**
 * memory-service's view of the media proxy (rt_llm_proxy). Injected so session
 * creation is testable without a running proxy. memory-service pushes the
 * pre-baked registration before the browser connects (refactor-three-services:
 * push context, direct media).
 */
export interface ProxyClient {
  register(sessionId: string, token: string, reg: Registration): Promise<void>;
}

/** HTTP-backed client: POST {proxyUrl}/session/{id}/register. */
export class HttpProxyClient implements ProxyClient {
  constructor(private readonly baseUrl: string) {}

  async register(sessionId: string, token: string, reg: Registration): Promise<void> {
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
}
