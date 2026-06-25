import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  /** Memory-service owns the analytics/event DB (session_events) — refactor-three-services. */
  eventsDbPath: string;
  /** Lightweight user auth DB for the web app login flow. */
  authDbPath: string;
  /** Base URL of the music-engine HTTP service (catalog retrieval + planning). */
  musicEngineUrl: string;
  /** Base URL of the media proxy (rt_llm_proxy) memory-service registers sessions with. */
  proxyUrl: string;
  /**
   * Proxy base URL handed to the browser for its WebRTC SDP offer. Defaults to the
   * same-origin "/proxy" path (Vite dev-proxy / prod reverse-proxy → the real proxy),
   * so no CORS is needed; distinct from proxyUrl (the server→proxy registration URL).
   */
  proxyPublicUrl: string;
  /** mem0 cross-session memory (degrades to no-op when absent). */
  geminiApiKey: string | undefined;
  flowModel: string;
  mem0EmbedModel: string;
  qdrantUrl: string;
  mem0HistoryDb: string;
}

export const config: Config = {
  port: Number(process.env.MEMORY_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.MEMORY_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  authDbPath: process.env.AUTH_DB_PATH ?? resolve(here, "../auracle-auth.sqlite"),
  musicEngineUrl: process.env.MUSIC_ENGINE_URL ?? "http://localhost:3010",
  proxyUrl: process.env.PROXY_URL ?? "http://localhost:8080",
  proxyPublicUrl: process.env.PROXY_PUBLIC_URL ?? "/proxy",
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  flowModel: process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite",
  mem0EmbedModel: process.env.GEMINI_MEM0_EMBED_MODEL ?? "gemini-embedding-001",
  qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  mem0HistoryDb: process.env.AURACLE_MEM0_HISTORY_DB ?? resolve(here, "../mem0-history.db"),
};
