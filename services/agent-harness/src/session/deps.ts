import type { MemoryServiceClient } from "../memory-service-client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import type { SessionStore } from "./state.js";

/** Shared adapters needed by session orchestration flows. */
export interface OrchestrationDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
}

export interface SessionLog {
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
}
