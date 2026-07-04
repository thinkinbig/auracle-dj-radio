import type { ProfileServiceClient, MusicEngineClient, ProxyClient } from "@auracle/clients";
import type { SessionStore } from "./state.js";

/** Shared adapters needed by session orchestration flows. */
export interface OrchestrationDeps {
  store: SessionStore;
  profile: ProfileServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
}

export interface SessionLog {
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
}
