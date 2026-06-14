import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Load service-local .env if present, then the repo-root .env (no override of existing).
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  /** Music-engine owns its own catalog SQLite (tracks + embeddings only — no session_events). */
  dbPath: string;
  /** Catalog data directory (manifest.json + audio/cover/photo assets) — @auracle/catalog. */
  catalogDataDir: string;
  geminiApiKey: string | undefined;
  flowModel: string;
  embedModel: string;
  /** "hash" (deterministic, offline) or "gemini" (real embeddings). Phase 1 ships hash-only. */
  embedder: "hash" | "gemini";
}

export const config: Config = {
  port: Number(process.env.MUSIC_ENGINE_PORT ?? 3010),
  dbPath: process.env.MUSIC_ENGINE_DB_PATH ?? resolve(here, "../auracle-catalog.sqlite"),
  catalogDataDir: process.env.CATALOG_DATA_DIR ?? resolve(here, "../../../packages/catalog/data"),
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  flowModel: process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite",
  embedModel: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2",
  embedder: process.env.AURACLE_EMBEDDER === "gemini" ? "gemini" : "hash",
};
