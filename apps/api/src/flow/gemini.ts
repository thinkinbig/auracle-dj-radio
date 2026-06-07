import { GoogleGenAI, Type } from "@google/genai";
import type { FlowResult } from "@auracle/shared";
import { buildHardRulesText } from "@auracle/shared";
import { config } from "../config.js";
import { resolveCatalogPath } from "../catalog/manifest.js";
import { createGeminiClient } from "../gemini/client.js";
import type { Embedder, EmbedTrackInput } from "./embedder.js";
import { formatEmbedQuery } from "./embedder.js";
import { readAudioEmbedClip } from "./audio-clip.js";
import type { FlowModel, FlowInput } from "./flow-model.js";

function resolveAudioPath(filePath: string): string {
  return filePath.startsWith("/") ? filePath : resolveCatalogPath(filePath);
}

/** Catalog embeddings via gemini-embedding-2 (first 180s audio, cross-modal query). */
export class GeminiEmbedder implements Embedder {
  private readonly ai = createGeminiClient();

  async embedTrack(t: EmbedTrackInput): Promise<number[]> {
    const audioPath = resolveAudioPath(t.filePath);
    const clip = await readAudioEmbedClip(audioPath);
    const res = await this.ai.models.embedContent({
      model: config.embedModel,
      contents: [{ inlineData: { mimeType: "audio/mpeg", data: clip.toString("base64") } }],
    });
    const values = res.embeddings?.[0]?.values;
    if (!values) throw new Error("Gemini embedContent returned no audio embedding");
    return values;
  }

  async embedQuery(mood: string, scene: string): Promise<number[]> {
    return this.embedText(formatEmbedQuery(mood, scene));
  }

  private async embedText(text: string): Promise<number[]> {
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
Always output session_title, session_subtitle, and reason fields in English.
session_title MUST name the show and include a volume number, e.g. "Quiet Hours, vol. 3".
session_subtitle MUST be duration + arc feel, e.g. "45 min · winds down".
Energy is an integer 1-5. For a full 8-track session: warm-up (1-2) → build (3-4) → peak (5-6) → wind-down (7-8).
When replanning remaining slots, glide smoothly from the last played energy down to a wind-down floor of 2; do NOT restart the full arc.
Hard rules: ${buildHardRulesText()}.
Only use track ids from the provided candidates. Output exactly the requested number of slots.`;

/** Step 2 Flow orchestration via gemini-3.1-flash-lite structured JSON. */
export class GeminiFlowModel implements FlowModel {
  private readonly ai = createGeminiClient();

  async plan(input: FlowInput): Promise<FlowResult> {
    const prompt = buildPrompt(input);
    const res = await this.ai.models.generateContent({
      model: config.flowModel,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: FLOW_SCHEMA,
        // Ordering candidates against explicit rules needs no chain-of-thought;
        // thinking is the dominant latency cost on flash, so cap it off.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = res.text;
    if (!text) throw new Error("Gemini flow model returned no text");
    return JSON.parse(text) as FlowResult;
  }
}

function buildPrompt(input: FlowInput): string {
  const lines = [
    input.memories ? `User profile: ${input.memories}` : "User profile: (none)",
    `Session intent: mood=${input.intent.mood}, scene=${input.intent.scene}, duration=${input.intent.duration_min}min`,
    `Already played: ${JSON.stringify(input.played)}`,
    `Last played energy: ${input.lastPlayedEnergy ?? "n/a (initial session)"}`,
    `Remaining slots: ${input.remainingSlots}`,
    `Candidate tracks: ${JSON.stringify(input.candidates)}`,
  ];
  if (input.repairHint) {
    lines.push(`Fix these violations from your previous attempt:\n${input.repairHint}`);
  }
  return lines.join("\n");
}
