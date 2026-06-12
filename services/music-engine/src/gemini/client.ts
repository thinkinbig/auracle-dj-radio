import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

/**
 * Gemini SDK client for music-engine's own flow + embedding calls (direct REST,
 * not through rt_llm_proxy). Single construction site for the provider classes.
 */
export function createGeminiClient(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for the Gemini provider");
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}
