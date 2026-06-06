import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

/** Shared Gemini SDK client (single construction site for plan/embed adapters). */
export function createGeminiClient(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for the Gemini provider");
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}
