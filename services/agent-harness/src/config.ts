import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  /** Base URL of the compatibility service that owns auth, analytics events, and session feedback derivation. */
  profileServiceUrl: string;
  /** Base URL of the music-engine HTTP service (catalog retrieval + planning). */
  musicEngineUrl: string;
  /** Base URL of the media proxy (rt_llm_proxy) agent-harness registers sessions with. */
  proxyUrl: string;
  /** Shared secret for proxy register/inject (PROXY_REGISTER_SECRET). */
  proxyRegisterSecret: string;
  /** Browser-facing proxy URL/path for the WebRTC SDP offer. */
  proxyPublicUrl: string;
}

export const config: Config = {
  port: Number(process.env.AGENT_HARNESS_PORT ?? 3030),
  profileServiceUrl: process.env.PROFILE_SERVICE_URL ?? "http://localhost:3020",
  musicEngineUrl: process.env.MUSIC_ENGINE_URL ?? "http://localhost:3010",
  proxyUrl: process.env.PROXY_URL ?? "http://localhost:8080",
  proxyRegisterSecret: process.env.PROXY_REGISTER_SECRET ?? "",
  proxyPublicUrl: process.env.PROXY_PUBLIC_URL ?? "/proxy",
};
