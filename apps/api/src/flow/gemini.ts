import { GoogleGenAI, Type } from "@google/genai";
import type { FlowResult } from "@auracle/shared";
import { config } from "../config.js";
import type { Embedder } from "./embedder.js";
import type { FlowModel, FlowInput } from "./flow-model.js";

function client(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for the Gemini provider");
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/** Real embeddings via gemini-embedding-001 (used when AURACLE_EMBEDDER=gemini). */
export class GeminiEmbedder implements Embedder {
  private readonly ai = client();

  async embed(text: string): Promise<number[]> {
    const res = await this.ai.models.embedContent({ model: config.embedModel, contents: text });
    const values = res.embeddings?.[0]?.values;
    if (!values) throw new Error("Gemini embedContent returned no embedding");
    return values;
  }
}

const FLOW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    session_title: { type: Type.STRING },
    session_subtitle: { type: Type.STRING },
    arc: { type: Type.STRING, enum: ["warm_up", "build", "peak", "wind_down"] },
    tracklist: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          flow_position: { type: Type.INTEGER },
          reason: { type: Type.STRING },
        },
        required: ["id", "flow_position", "reason"],
      },
    },
  },
  required: ["session_title", "session_subtitle", "arc", "tracklist"],
};

const SYSTEM_INSTRUCTION = `You are a professional radio session curator. Order candidate tracks into an energy arc.
Energy is an integer 1-5. For a full 8-track session: warm-up (1-2) → build (3-4) → peak (5-6) → wind-down (7-8).
When replanning remaining slots, glide smoothly from the last played energy down to a wind-down floor of 2; do NOT restart the full arc.
Hard rules: adjacent tempo difference ≤ 15 BPM; energy step ≤ 1 level; no two consecutive tracks share a genre.
Only use track ids from the provided candidates. Output exactly the requested number of slots.`;

/** Step 2 Flow orchestration via gemini-2.5-flash structured JSON. */
export class GeminiFlowModel implements FlowModel {
  private readonly ai = client();

  async plan(input: FlowInput): Promise<FlowResult> {
    const prompt = buildPrompt(input);
    const res = await this.ai.models.generateContent({
      model: config.flowModel,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: FLOW_SCHEMA,
      },
    });
    const text = res.text;
    if (!text) throw new Error("Gemini flow model returned no text");
    return JSON.parse(text) as FlowResult;
  }
}

function buildPrompt(input: FlowInput): string {
  return [
    input.memories ? `User profile: ${input.memories}` : "User profile: (none)",
    `Session intent: mood=${input.intent.mood}, scene=${input.intent.scene}, duration=${input.intent.duration_min}min`,
    `Already played: ${JSON.stringify(input.played)}`,
    `Last played energy: ${input.lastPlayedEnergy ?? "n/a (initial session)"}`,
    `Remaining slots: ${input.remainingSlots}`,
    `Candidate tracks: ${JSON.stringify(input.candidates)}`,
  ].join("\n");
}
