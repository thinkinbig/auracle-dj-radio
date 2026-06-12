import type { Memory } from "mem0ai/oss";
import { config } from "../config.js";

/** Hardcoded single demo user (doc/auracle_memory_decision.md). */
const USER_ID = "auracle_user";
const COLLECTION = "auracle_memories";

/**
 * Cross-session preference memory (mem0 OSS + Qdrant, gemini-embedding-001 native
 * 3072-dim). All ops degrade to no-ops if there's no key or Qdrant is unreachable,
 * so session creation keeps working without the memory stack. No Gemini circuit
 * breaker here — the first failure latches `broken` and every later op short-circuits
 * to a no-op (refactor-three-services 2b: circuit breaking is rt_llm_proxy's job).
 */
export interface MemoryClient {
  readonly enabled: boolean;
  /** True once the backing store has failed and all ops are silently no-oped. */
  readonly degraded: boolean;
  /** Recalled facts as a short bullet list, or "" if none / unavailable. */
  recall(query: string): Promise<string>;
  /** Extract and persist a preference fact for future sessions. */
  remember(fact: string, sessionId: string): Promise<void>;
}

class NoopMemory implements MemoryClient {
  readonly enabled = false;
  readonly degraded = false;
  async recall(): Promise<string> {
    return "";
  }
  async remember(): Promise<void> {}
}

class Mem0Memory implements MemoryClient {
  readonly enabled = true;
  private memory: Memory | undefined;
  private broken = false;

  get degraded(): boolean {
    return this.broken;
  }

  private async client(): Promise<Memory> {
    if (!this.memory) {
      const { Memory } = await import("mem0ai/oss");
      this.memory = new Memory({
        embedder: { provider: "google", config: { apiKey: config.geminiApiKey!, model: config.mem0EmbedModel } },
        llm: { provider: "google", config: { apiKey: config.geminiApiKey!, model: config.flowModel } },
        vectorStore: { provider: "qdrant", config: { url: config.qdrantUrl, collectionName: COLLECTION, dimension: 3072 } },
        historyDbPath: config.mem0HistoryDb,
      });
    }
    return this.memory;
  }

  async recall(query: string): Promise<string> {
    if (this.broken) return "";
    try {
      const m = await this.client();
      const res = await m.search(query, { filters: { user_id: USER_ID }, topK: 5 });
      const facts = res.results.map((r) => r.memory).filter((f): f is string => Boolean(f));
      return facts.map((f) => `- ${f}`).join("\n");
    } catch (err) {
      this.broken = true;
      console.error("[mem0] recall failed, disabling memory:", (err as Error).message);
      return "";
    }
  }

  async remember(fact: string, sessionId: string): Promise<void> {
    if (this.broken || !fact.trim()) return;
    try {
      const m = await this.client();
      await m.add(fact, { userId: USER_ID, runId: sessionId });
    } catch (err) {
      console.error("[mem0] remember failed:", (err as Error).message);
    }
  }
}

export function createMemoryClient(): MemoryClient {
  return config.geminiApiKey ? new Mem0Memory() : new NoopMemory();
}
