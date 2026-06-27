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
  /** Per-user structured taste preferences DB (Epic #3, S2). */
  tastePrefsDbPath: string;
  /** Per-user imported playlist archive DB. */
  playlistDbPath: string;
  /** mem0 cross-session memory (degrades to no-op when absent). */
  geminiApiKey: string | undefined;
  mem0LlmModel: string;
  mem0EmbedModel: string;
  qdrantUrl: string;
  mem0HistoryDb: string;
}

export const config: Config = {
  port: Number(process.env.MEMORY_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.MEMORY_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  authDbPath: process.env.AUTH_DB_PATH ?? resolve(here, "../auracle-auth.sqlite"),
  tastePrefsDbPath: process.env.TASTE_PREFS_DB_PATH ?? resolve(here, "../auracle-taste.sqlite"),
  playlistDbPath: process.env.PLAYLIST_ARCHIVE_DB_PATH ?? resolve(here, "../auracle-playlists.sqlite"),
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  mem0LlmModel: process.env.GEMINI_MEM0_LLM_MODEL ?? "gemini-3.1-flash-lite",
  mem0EmbedModel: process.env.GEMINI_MEM0_EMBED_MODEL ?? "gemini-embedding-001",
  qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  mem0HistoryDb: process.env.AURACLE_MEM0_HISTORY_DB ?? resolve(here, "../mem0-history.db"),
};
