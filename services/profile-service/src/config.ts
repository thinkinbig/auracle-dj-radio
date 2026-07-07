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
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  supabaseJwksUrl?: string;
  supabaseJwtIssuer?: string;
  supabaseJwtAudience?: string;
}

export const config: Config = {
  port: Number(process.env.PROFILE_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.PROFILE_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET,
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL,
  supabaseJwtIssuer: process.env.SUPABASE_JWT_ISSUER,
  supabaseJwtAudience: process.env.SUPABASE_JWT_AUDIENCE,
};
