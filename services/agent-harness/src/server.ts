import Fastify, { type FastifyInstance } from "fastify";
import type { ProfileServiceClient, MusicEngineClient, ProxyClient } from "@auracle/clients";
import { registerSessionRoutes } from "./routes/sessions.js";
import { createSessionRuntime } from "./session/runtime.js";
import { SessionStore } from "./session/state.js";

export interface SessionServerDeps {
  store: SessionStore;
  profile: ProfileServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
  /** Public base URL of the proxy handed to the browser for the SDP offer. */
  proxyPublicUrl: string;
}

/**
 * Agent-harness owns the runtime orchestration loop: session state, DJ tool
 * side-effects, playlist replan triggers, proxy pushes, and traceable decisions.
 */
export function buildServer(deps: SessionServerDeps): FastifyInstance {
  const app = Fastify({ logger: true });
  const harness = createSessionRuntime({ ...deps, log: app.log });

  app.get("/health", async () => ({ ok: true }));
  registerSessionRoutes(app, { harness, profile: deps.profile });

  return app;
}
