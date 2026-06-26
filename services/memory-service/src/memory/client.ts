import type { Memory } from "mem0ai/oss";
import { config } from "../config.js";

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
  /** Recalled facts for `userId` as a short bullet list, or "" if none / unavailable. */
  recall(query: string, userId: string): Promise<string>;
  /** Two-query recall tuned for session planning: exact mood+scene plus broader scene taste. */
  recallForIntent(userId: string, mood: string, scene: string): Promise<string>;
  /** Extract and persist a preference fact for `userId`'s future sessions. */
  remember(fact: string, sessionId: string, userId: string): Promise<void>;
  /** Drop all facts for `userId` under `sessionId` (run scope) — used to replace
   *  a regenerated summary instead of accumulating contradictory copies. */
  forget(sessionId: string, userId: string): Promise<void>;
}

function dedupeFacts(facts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const fact of facts) {
    const normalized = fact.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(fact.trim());
  }
  return out;
}

function formatFacts(facts: string[]): string {
  return facts.map((f) => `- ${f}`).join("\n");
}

class NoopMemory implements MemoryClient {
  readonly enabled = false;
  readonly degraded = false;
  async recall(): Promise<string> {
    return "";
  }
  async recallForIntent(): Promise<string> {
    return "";
  }
  async remember(): Promise<void> {}
  async forget(): Promise<void> {}
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

  private async searchFacts(query: string, userId: string, topK = 5): Promise<string[]> {
    if (this.broken) return [];
    try {
      const m = await this.client();
      const res = await m.search(query, { filters: { user_id: userId }, topK });
      return res.results.map((r) => r.memory).filter((f): f is string => Boolean(f));
    } catch (err) {
      this.broken = true;
      console.error("[mem0] recall failed, disabling memory:", (err as Error).message);
      return [];
    }
  }

  async recall(query: string, userId: string): Promise<string> {
    return formatFacts(await this.searchFacts(query, userId));
  }

  async recallForIntent(userId: string, mood: string, scene: string): Promise<string> {
    const exact = `music preferences for a ${mood} ${scene} session`;
    const sceneWide = `music preferences for ${scene} sessions`;
    return formatFacts(dedupeFacts([
      ...(await this.searchFacts(exact, userId)),
      ...(await this.searchFacts(sceneWide, userId)),
    ]));
  }

  async remember(fact: string, sessionId: string, userId: string): Promise<void> {
    if (this.broken || !fact.trim()) return;
    try {
      const m = await this.client();
      await m.add(fact, { userId, runId: sessionId });
    } catch (err) {
      console.error("[mem0] remember failed:", (err as Error).message);
    }
  }

  async forget(sessionId: string, userId: string): Promise<void> {
    if (this.broken) return;
    try {
      const m = await this.client();
      await m.deleteAll({ userId, runId: sessionId });
    } catch (err) {
      console.error("[mem0] forget failed:", (err as Error).message);
    }
  }
}

export function createMemoryClient(): MemoryClient {
  return config.geminiApiKey ? new Mem0Memory() : new NoopMemory();
}
