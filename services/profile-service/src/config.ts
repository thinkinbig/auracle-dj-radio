import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  /** Profile-service owns the analytics/event DB (session_events). */
  eventsDbPath: string;
  /** Lightweight user auth DB for the web app login flow. */
  authDbPath: string;
}

export const config: Config = {
  port: Number(process.env.PROFILE_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.PROFILE_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  authDbPath: process.env.AUTH_DB_PATH ?? resolve(here, "../auracle-auth.sqlite"),
};
