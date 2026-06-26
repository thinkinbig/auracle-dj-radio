import Fastify, { type FastifyInstance } from "fastify";
import { AgentHarness } from "./harness/agent-harness.js";
import type { MemoryServiceClient } from "./memory-service-client.js";
import type { MusicEngineClient } from "./music-engine-client.js";
import type { ProxyClient } from "./proxy-client.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { SessionStore } from "./session/store.js";

export interface AgentHarnessDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
  /** Public base URL of the proxy handed to the browser for the SDP offer. */
  proxyPublicUrl: string;
}

/**
 * Agent-harness owns the runtime orchestration loop: session state, DJ tool
 * side-effects, playlist replan triggers, proxy pushes, and traceable decisions.
 */
export function buildServer(deps: AgentHarnessDeps): FastifyInstance {
  const app = Fastify({ logger: true });
  const harness = new AgentHarness({ ...deps, log: app.log });

  app.get("/health", async () => ({ ok: true }));
  registerSessionRoutes(app, { harness, memory: deps.memory });

  return app;
}
