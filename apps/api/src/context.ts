import { config } from "./config.js";
import { Db } from "./db/index.js";
import { SessionStore } from "./session/store.js";
import { buildEmbedder, buildFlowModel } from "./gemini/wiring.js";
import type { PlanDeps } from "./flow/plan.js";
import { createMemoryClient, type MemoryClient } from "./memory/client.js";

export interface ApiContext {
  db: Db;
  store: SessionStore;
  planDeps: PlanDeps;
  memory: MemoryClient;
}

/** Wire Brain providers (Flow, embed, memory) for the Fastify process. */
export async function buildContext(): Promise<ApiContext> {
  const db = new Db(config.dbPath);
  const embedder = await buildEmbedder();
  const flowModel = await buildFlowModel();
  const planDeps: PlanDeps = { embedder, flowModel, tracks: () => db.allTracks() };
  return { db, store: new SessionStore(), planDeps, memory: createMemoryClient() };
}
