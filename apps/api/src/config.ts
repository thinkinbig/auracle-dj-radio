import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Load apps/api/.env if present, then the repo-root .env (no override of existing).
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  dbPath: string;
  geminiApiKey: string | undefined;
  flowModel: string;
  liveModel: string;
  embedModel: string;
  /** "hash" (deterministic, offline) or "gemini" (real embeddings). */
  embedder: "hash" | "gemini";
  qdrantUrl: string;
  mem0HistoryDb: string;
}

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.AURACLE_DB_PATH ?? resolve(here, "../../../auracle.sqlite"),
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  flowModel: process.env.GEMINI_FLOW_MODEL ?? "gemini-2.5-flash",
  liveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
  embedModel: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
  embedder: process.env.AURACLE_EMBEDDER === "gemini" ? "gemini" : "hash",
  qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  mem0HistoryDb: process.env.AURACLE_MEM0_HISTORY_DB ?? resolve(here, "../../../data/mem0/history.db"),
};
