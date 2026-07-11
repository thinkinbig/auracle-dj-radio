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
  eventsStore: "sqlite" | "supabase";
  supabaseUrl?: string;
  /** Server-only secret key used for internal event persistence via the Data API. */
  supabaseSecretKey?: string;
  supabaseJwtSecret?: string;
  supabaseJwksUrl?: string;
  supabaseJwtIssuer?: string;
  supabaseJwtAudience?: string;
}

const eventsStore = (process.env.PROFILE_EVENTS_STORE?.trim().toLowerCase() || "sqlite") as Config["eventsStore"];
if (eventsStore !== "sqlite" && eventsStore !== "supabase") {
  throw new Error(`PROFILE_EVENTS_STORE must be sqlite or supabase, got ${eventsStore}`);
}
const supabaseSecretKey = optionalEnv("SUPABASE_SECRET_KEY") ?? optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
if (eventsStore === "supabase" && !supabaseSecretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required when PROFILE_EVENTS_STORE=supabase");
}

export const config: Config = {
  port: Number(process.env.PROFILE_SERVICE_PORT ?? 3020),
  eventsDbPath: process.env.PROFILE_EVENTS_DB_PATH ?? resolve(here, "../auracle-events.sqlite"),
  eventsStore,
  supabaseUrl: optionalEnv("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL,
  supabaseSecretKey,
  supabaseJwtSecret: optionalEnv("SUPABASE_JWT_SECRET"),
  supabaseJwksUrl: optionalEnv("SUPABASE_JWKS_URL"),
  supabaseJwtIssuer: optionalEnv("SUPABASE_JWT_ISSUER"),
  supabaseJwtAudience: optionalEnv("SUPABASE_JWT_AUDIENCE"),
};
