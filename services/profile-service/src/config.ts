import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

// Keep local auth verification aligned with the web app's built-in Supabase
// fallback. The URL is public; secrets still come only from env when supplied.
const DEFAULT_SUPABASE_URL = "https://ltghoxrkovuwhdubzpbf.supabase.co";

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

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
  supabaseUrl: optionalEnv("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL,
  supabaseJwtSecret: optionalEnv("SUPABASE_JWT_SECRET"),
  supabaseJwksUrl: optionalEnv("SUPABASE_JWKS_URL"),
  supabaseJwtIssuer: optionalEnv("SUPABASE_JWT_ISSUER"),
  supabaseJwtAudience: optionalEnv("SUPABASE_JWT_AUDIENCE"),
};
