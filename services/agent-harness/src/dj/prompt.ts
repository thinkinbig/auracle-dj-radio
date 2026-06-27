import { Type, type FunctionDeclaration } from "@google/genai";
import type { Condition, HostMode, TrackMeta } from "@auracle/shared";
import { HOST_MODES } from "@auracle/shared";

/** Function declarations sent once at Live setup (doc §4). Same set for A/B/C. */
export const DJ_TOOLS: FunctionDeclaration[] = [
  {
    name: "skip_track",
    description: "User wants to skip the current track and jump to the next one. Fire as soon as they ask, even mid-song. A plain skip is not a mood or energy change; do not also call mood_change unless the user explicitly asks to change the remaining set.",
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
      : "mood_change → adjusts what's coming: a small tweak nudges the next track or two, a bigger mood shift re-steers more of the queue (handled automatically). Tell the user what's next is changing. If they want a completely fresh set, suggest they tap Regenerate.";
  const context = input.mem0Context.trim() || "(no prior preferences on file)";
  return `You are Auracle, a live set DJ — not a podcast host, not a chatbot.

DELIVERY
- Talk over the intro of the now-playing track; music is already underneath you — except the session opening (track 1), where music stays silent until you finish.
- Never say "welcome to", "today we", "in this episode", or read stats (BPM, energy numbers).
- Short lines only. Never read the tracklist.

SESSION
- Hosting "${input.title}" (${input.subtitle}), ${input.total} tracks, arc already set.
- The user can talk to you any time (they hold a talk button). Act on clear intents immediately, even mid-song: skip_track, pause_playback, change_host_mode, record_preference all apply right away.
- For casual remarks, acknowledge briefly without a tool.

HOST MODE: ${input.hostMode}
${MODE_INSTRUCTION[input.hostMode]}

VOICE
- Always speak English. All session titles, spoken lines, and transcriptions must be in English.

TOOLS
- ${moodRule}
- change_host_mode → switch speaking style only; playlist unchanged. NOT for music taste changes.
- pause_playback: action="pause" when user asks to pause/stop; action="resume" when user asks to continue/play/restart. Always respond with acknowledgment.
- skip_track, record_preference as documented. For a plain "skip"/"next" request, call only skip_track; do not also call mood_change or record_preference unless the user explicitly states a taste, mood, or energy change.

CONTEXT (preferences carried across sessions)
${context}
Listener intent: mood=${input.mood}, scene=${input.scene}.`;
}

export type CueKind = "opening" | "segue" | "outro" | "break";

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

/** Project track metadata down to the subset a cue needs. */
export function toCueTrack(meta: TrackMeta | undefined): CueTrack | undefined {
  if (!meta) return undefined;
  return {
    title: meta.title,
    artist: meta.artist,
    albumTitle: meta.albumTitle,
    energy: meta.energy,
    tempo: meta.tempo,
    genre: meta.genre,
    lore: meta.lore,
  };
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

  if (kind === "break") {
    // End-of-track talk break (ADR-0004): the just-played track is `now`, the
    // upcoming one is `next`. Invite a change, then stop — a listening window
    // opens for the user's reply.
    lines.push(`[break, ${hostMode}, 4-7s]`);
    lines.push("The current track is ending. Wrap it, tease what's next, and invite the listener to keep this energy or change it up.");
    if (input.now) lines.push(`Just played: "${input.now.title}" by ${input.now.artist}.`);
    if (input.next) {
      lines.push(`Next: "${input.next.title}" by ${input.next.artist} — vibe: ${vibeHint(input.next)}. Do not read stats.`);
    }
    lines.push("End by asking if they want a change, then stop and wait — do not keep talking.");
    return lines.join(" ");
  }

  if (kind === "outro") {
    lines.push(`[outro, ${hostMode}, closing]`);
    lines.push("The set is ending as this last track plays out.");
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
