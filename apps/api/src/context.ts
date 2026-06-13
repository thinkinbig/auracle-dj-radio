import { config } from "./config.js";
import { Db } from "./db/index.js";

export interface ApiContext {
  db: Db;
}

/** Wire the catalog DB for the Fastify process. */
export async function buildContext(): Promise<ApiContext> {
  return { db: new Db(config.dbPath) };
}
