import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Load apps/api/.env if present, then the repo-root .env (no override of existing).
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

/** Default on in production; unset elsewhere also on (free-tier Gemini is flaky). Explicit env always wins. */
function resolveGeminiCbEnable(): boolean {
  const raw = process.env.GEMINI_CB_ENABLE?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV === "production" || process.env.NODE_ENV !== "test";
}

export interface Config {
  port: number;
  dbPath: string;
  geminiApiKey: string | undefined;
  flowModel: string;
  liveModel: string;
  /** Catalog retrieval (gemini-embedding-2 audio-native). */
  embedModel: string;
  /** mem0 preference vectors — separate index from catalog (ADR-0002). */
  mem0EmbedModel: string;
  /** "hash" (deterministic, offline) or "gemini" (real embeddings). */
  embedder: "hash" | "gemini";
  qdrantUrl: string;
  mem0HistoryDb: string;
  /** Circuit breaker for Gemini upstream (rt_llm_proxy modelcb pattern). */
  geminiCbEnable: boolean;
  geminiCbOpenAfter: number;
  geminiCbOpenForMs: number;
  geminiCbHalfOpenSuccess: number;
  geminiCbAuthOpenForMs: number;
}

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.AURACLE_DB_PATH ?? resolve(here, "../../../auracle.sqlite"),
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  flowModel: process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite",
  liveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
  embedModel: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2",
  mem0EmbedModel: process.env.GEMINI_MEM0_EMBED_MODEL ?? "gemini-embedding-001",
  embedder: process.env.AURACLE_EMBEDDER === "gemini" ? "gemini" : "hash",
  qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  mem0HistoryDb: process.env.AURACLE_MEM0_HISTORY_DB ?? resolve(here, "../../../data/mem0/history.db"),
  geminiCbEnable: resolveGeminiCbEnable(),
  geminiCbOpenAfter: Number(process.env.GEMINI_CB_OPEN_AFTER ?? 5),
  geminiCbOpenForMs: Number(process.env.GEMINI_CB_OPEN_FOR_MS ?? 30_000),
  geminiCbHalfOpenSuccess: Number(process.env.GEMINI_CB_HALF_OPEN_SUCCESS ?? 3),
  geminiCbAuthOpenForMs: Number(process.env.GEMINI_CB_AUTH_OPEN_FOR_MS ?? 300_000),
};
