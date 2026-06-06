/**
 * mem0 round-trip smoke test (manual, NOT CI — needs GEMINI_API_KEY + a running
 * Qdrant: `docker compose up -d qdrant`). Spends key on LLM extraction + embedding.
 *
 * Writes one preference fact, then recalls it, proving the mem0 OSS + Qdrant +
 * gemini-embedding-001 (native 3072) stack works end to end.
 *
 * Run:  npx tsx scripts/mem0-smoke.mts
 */
import { createMemoryClient } from "../src/memory/client.js";

const mem = createMemoryClient();
console.log("memory enabled:", mem.enabled);

const sessionId = `smoke-${Date.now()}`;
const fact = "The user loves lo-fi beats while studying and dislikes high-energy EDM.";
console.log("remember:", fact);
await mem.remember(fact, sessionId);

// Give Qdrant a beat to index the upsert.
await new Promise((r) => setTimeout(r, 1500));

const recalled = await mem.recall("what music does the user like for studying");
console.log("\nrecall:\n" + (recalled || "(empty)"));

const ok = recalled.toLowerCase().includes("lo-fi") || recalled.toLowerCase().includes("edm");
console.log(ok ? "\n✅ PASS — mem0 write→recall round-trip works" : "\n❌ FAIL — fact not recalled");
process.exit(ok ? 0 : 1);
