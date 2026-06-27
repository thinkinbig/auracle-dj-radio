import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

/** Gemini SDK client for music-engine flow calls (direct REST, not rt_llm_proxy). */
export function createGeminiClient(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for the Gemini provider");
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}
