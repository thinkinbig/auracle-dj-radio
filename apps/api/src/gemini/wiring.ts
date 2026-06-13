import { config } from "../config.js";
import { HashEmbedder, type Embedder } from "../flow/embedder.js";

/** Offline seed: raw embedder, no circuit-breaker (batch job, not runtime). */
export async function buildSeedEmbedder(): Promise<Embedder> {
  if (config.embedder === "gemini" && config.geminiApiKey) {
    const { GeminiEmbedder } = await import("../flow/gemini.js");
    return new GeminiEmbedder();
  }
  return new HashEmbedder();
}
