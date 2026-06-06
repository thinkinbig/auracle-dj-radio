import { Type, type FunctionDeclaration } from "@google/genai";
import type { Condition } from "@auracle/shared";

/** Function declarations sent once at Live setup (doc §4). Same set for A/B/C. */
export const DJ_TOOLS: FunctionDeclaration[] = [
  {
    name: "skip_track",
    description: "User wants to skip to the next track during the between-tracks window.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "mood_change",
    description: "User wants a different mood or energy for the remaining tracks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mood: { type: Type.STRING },
        energy_delta: { type: Type.STRING, enum: ["lighter", "heavier", "same"] },
      },
      required: ["mood"],
    },
  },
  {
    name: "pause_playback",
    description: "Pause or resume music.",
    parameters: {
      type: Type.OBJECT,
      properties: { action: { type: Type.STRING, enum: ["pause", "resume"] } },
      required: ["action"],
    },
  },
  {
    name: "record_preference",
    description: "Save a taste or context fact for future sessions.",
    parameters: {
      type: Type.OBJECT,
      properties: { fact: { type: Type.STRING } },
      required: ["fact"],
    },
  },
];

export interface SystemInstructionInput {
  title: string;
  subtitle: string;
  total: number;
  mem0Context: string;
  condition: Condition;
}

/** Host persona + session rules (doc §5). Condition A pins the playlist. */
export function buildSystemInstruction(input: SystemInstructionInput): string {
  const moodRule =
    input.condition === "A"
      ? "mood_change → acknowledge warmly, but the playlist is fixed; do NOT promise to change what's next."
      : "mood_change → triggers a replan; tell the user you're adjusting what's next.";
  const context = input.mem0Context.trim() || "(no prior preferences on file)";
  return `You are Auracle, a warm radio host — not a chatbot, not a playlist app.

SESSION RULES
- You are hosting "${input.title}" (${input.subtitle}), a ${input.total}-track set.
- Tracks play in a fixed arc; you speak between songs (opening, segues, outro).
- The user may ONLY change the remaining playlist between tracks, not mid-song.
- If they speak during a song, acknowledge briefly; use tools only for clear intents.

VOICE
- Always speak English. All session titles, spoken lines, and transcriptions must be in English.
- Short spoken lines (5-15 seconds). Never read the full tracklist.
- Match the session arc: wind_down = calm; gym = energetic but not shouty.

TOOLS
- ${moodRule}
- skip_track, pause_playback, record_preference as documented.

CONTEXT (preferences carried across sessions)
${context}`;
}

export type CueKind = "opening" | "segue" | "outro";

export interface CueTrack {
  title: string;
  energy: number;
  tempo: number;
  genre: string;
}

export interface CueInput {
  kind: CueKind;
  sessionTitle: string;
  now?: CueTrack;
  next?: CueTrack;
}

/**
 * Build the scene-direction cue text sent via realtimeInput between tracks
 * (doc §4 "口播 cue"). 3.1 uses realtimeInput for mid-session cues, not clientContent.
 */
export function buildCueText(input: CueInput): string {
  const tone = input.kind === "outro" ? "warm, closing" : input.kind === "opening" ? "warm, welcoming" : "smooth";
  const lines: string[] = [`[${input.kind}, ${tone}, ~8s]`];
  if (input.kind === "opening") {
    lines.push(`Open the set "${input.sessionTitle}".`);
  } else if (input.kind === "outro") {
    lines.push(`This is the last track of "${input.sessionTitle}".`);
  }
  if (input.now) {
    lines.push(`Now playing: "${input.now.title}" (${input.now.energy}/5, ${input.now.tempo} BPM, ${input.now.genre}).`);
  }
  if (input.next && input.kind !== "outro") {
    lines.push(`Up next: "${input.next.title}".`);
  }
  return lines.join(" ");
}
