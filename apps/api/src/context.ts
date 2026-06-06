import { config } from "./config.js";
import { Db } from "./db/index.js";
import { SessionStore } from "./session/store.js";
import { HashEmbedder, type Embedder } from "./flow/embedder.js";
import { HeuristicFlowModel } from "./flow/heuristic-flow.js";
import type { FlowModel } from "./flow/flow-model.js";
import type { PlanDeps } from "./flow/plan.js";
import { createMemoryClient, type MemoryClient } from "./memory/client.js";

export interface ApiContext {
  db: Db;
  store: SessionStore;
  planDeps: PlanDeps;
  memory: MemoryClient;
}

/**
 * Wire providers. With a Gemini key we use the real Flash flow model and
 * (optionally) Gemini embeddings; otherwise the deterministic offline pair,
 * so the server boots and the demo runs without external calls.
 */
export async function buildContext(): Promise<ApiContext> {
  const db = new Db(config.dbPath);
  const embedder = await selectEmbedder();
  const flowModel = await selectFlowModel();
  const planDeps: PlanDeps = { embedder, flowModel, tracks: () => db.allTracks() };
  return { db, store: new SessionStore(), planDeps, memory: createMemoryClient() };
}

export async function selectEmbedder(): Promise<Embedder> {
  if (config.embedder === "gemini" && config.geminiApiKey) {
    const { GeminiEmbedder } = await import("./flow/gemini.js");
    return new GeminiEmbedder();
  }
  return new HashEmbedder();
}

async function selectFlowModel(): Promise<FlowModel> {
  if (config.geminiApiKey) {
    const { GeminiFlowModel } = await import("./flow/gemini.js");
    return new GeminiFlowModel();
  }
  return new HeuristicFlowModel();
}
