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
  /** Base URL of the music-engine HTTP service (catalog retrieval + planning). */
  musicEngineUrl: string;
}

export const config: Config = {
  port: Number(process.env.MEMORY_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.MEMORY_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  musicEngineUrl: process.env.MUSIC_ENGINE_URL ?? "http://localhost:3010",
};
