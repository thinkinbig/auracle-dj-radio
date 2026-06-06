import { Type, type FunctionDeclaration } from "@google/genai";
import type { Condition, HostMode } from "@auracle/shared";
import { HOST_MODES } from "@auracle/shared";

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
    name: "change_host_mode",
    description:
      "User wants you to speak differently (more hype, quieter, more curation). Does NOT change the playlist.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        host_mode: { type: Type.STRING, enum: [...HOST_MODES] },
      },
      required: ["host_mode"],
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

const MODE_INSTRUCTION: Record<HostMode, string> = {
  set_dj: "Cool, music-first. One sentence max. Vibe over explanation.",
  curator: "Warm curator. May name the set once per session. Brief context OK.",
  hype: "High energy, short imperatives. No shouting. Ride the beat.",
};

const OPENING_DURATION: Record<HostMode, string> = {
  set_dj: "5-8s",
  hype: "4-6s",
  curator: "8-12s",
};

const OPENING_EXAMPLE: Record<HostMode, string> = {
  set_dj: "Alright — something soft to ease in.",
  hype: "Here we go — lock in.",
  curator: "Quiet Hours — let's start gentle with this one.",
};

export interface SystemInstructionInput {
  title: string;
  subtitle: string;
  total: number;
  mem0Context: string;
  condition: Condition;
  hostMode: HostMode;
  mood: string;
  scene: string;
}

/** Host persona + session rules (doc §5). Condition A pins the playlist. */
export function buildSystemInstruction(input: SystemInstructionInput): string {
  const moodRule =
    input.condition === "A"
      ? "mood_change → acknowledge warmly, but the playlist is fixed; do NOT promise to change what's next."
      : "mood_change → replan remaining tracks; tell the user you're adjusting what's next.";
  const context = input.mem0Context.trim() || "(no prior preferences on file)";
  return `You are Auracle, a live set DJ — not a podcast host, not a chatbot.

DELIVERY
- Talk over the intro of the now-playing track; music is already underneath you — except the session opening (track 1), where music stays silent until you finish.
- Never say "welcome to", "today we", "in this episode", or read stats (BPM, energy numbers).
- Short lines only. Never read the tracklist.

SESSION
- Hosting "${input.title}" (${input.subtitle}), ${input.total} tracks, arc already set.
- User can change remaining playlist between tracks only.
- If they speak during a song, acknowledge briefly; use tools only for clear intents.

HOST MODE: ${input.hostMode}
${MODE_INSTRUCTION[input.hostMode]}

VOICE
- Always speak English. All session titles, spoken lines, and transcriptions must be in English.

TOOLS
- ${moodRule}
- change_host_mode → switch speaking style only; playlist unchanged. NOT for music taste changes.
- skip_track, pause_playback, record_preference as documented.

CONTEXT (preferences carried across sessions)
${context}
Listener intent: mood=${input.mood}, scene=${input.scene}.`;
}

export type CueKind = "opening" | "segue" | "outro";

export interface CueTrack {
  title: string;
  artist: string;
  albumTitle: string;
  energy: number;
  tempo: number;
  genre: string;
  /** One-line lore hint for curator mode only — not a script. */
  lore?: string;
}

export interface CueInput {
  kind: CueKind;
  hostMode: HostMode;
  sessionTitle: string;
  now?: CueTrack;
  next?: CueTrack;
}

/** Natural-language vibe from track metadata — never speak raw BPM or energy numbers. */
export function vibeHint(track: CueTrack): string {
  const pace =
    track.tempo < 80 ? "slow and unhurried" : track.tempo < 110 ? "steady groove" : "driving pace";
  const weight =
    track.energy <= 2 ? "soft" : track.energy <= 3 ? "balanced" : track.energy <= 4 ? "lifted" : "peak energy";
  return `${weight}, ${pace}, ${track.genre}`;
}

function trackLine(track: CueTrack): string {
  return `Track: "${track.title}" by ${track.artist} — vibe: ${vibeHint(track)}.`;
}

/** Short phrase from lore for curator segues (≤ ~15 words). */
function loreHint(lore: string): string {
  const sentence = lore.split(/[.!?]/)[0]?.trim() ?? lore.trim();
  const words = sentence.split(/\s+/);
  return words.length > 15 ? `${words.slice(0, 15).join(" ")}…` : sentence;
}

/**
 * Build the scene-direction cue text sent via realtimeInput between tracks
 * (doc §4 "口播 cue"). 3.1 uses realtimeInput for mid-session cues, not clientContent.
 */
export function buildCueText(input: CueInput): string {
  const { kind, hostMode } = input;
  const lines: string[] = [];

  if (kind === "opening") {
    lines.push(`[opening, ${hostMode}, ${OPENING_DURATION[hostMode]}]`);
    lines.push("Music is silent — open the set before playback begins. Track one is preloading but not playing yet.");
    if (input.now) lines.push(trackLine(input.now));
    if (input.now?.lore && hostMode === "curator") {
      lines.push(
        `Lore hint (borrow one phrase, ≤15 words, do not read verbatim): "${loreHint(input.now.lore)}".`,
      );
    }
    if (hostMode === "curator") {
      lines.push(`Set name "${input.sessionTitle}" — mention once, softly, optional.`);
    }
    lines.push("Do NOT preview upcoming tracks.");
    lines.push(
      `Example tone: "${OPENING_EXAMPLE[hostMode]}" — match this energy, do not read verbatim.`,
    );
    return lines.join(" ");
  }

  if (kind === "outro") {
    lines.push(`[outro, ${hostMode}, closing]`);
    lines.push("Talk over the intro — music is already playing.");
    lines.push(`Last track of "${input.sessionTitle}".`);
    if (input.now) lines.push(trackLine(input.now));
    return lines.join(" ");
  }

  // segue
  lines.push(`[segue, ${hostMode}, 5-8s]`);
  lines.push("Talk over the intro — music is already playing.");
  if (input.now) lines.push(trackLine(input.now));
  if (input.now?.lore && hostMode === "curator") {
    lines.push(
      `Lore hint (borrow one phrase, ≤15 words, do not read verbatim): "${loreHint(input.now.lore)}".`,
    );
  }
  if (input.next) {
    lines.push(`Next: "${input.next.title}" by ${input.next.artist} — vibe: ${vibeHint(input.next)}. Do not read stats.`);
  }
  return lines.join(" ");
}
