import type { FunctionDeclaration } from "@google/genai";
import type { SessionState } from "../session/state.js";
import { buildCueText, buildSystemInstruction, DJ_TOOLS, type CueTrack } from "./prompt.js";

/**
 * The pre-baked registration contract memory-service hands the proxy at session
 * start (refactor-three-services §session-lifecycle). Every string is fully
 * assembled here — the proxy never composes prompts. The proxy injects
 * systemInstruction + tools at Live setup and auto-plays openingCue on connect.
 */
export interface Registration {
  systemInstruction: string;
  tools: FunctionDeclaration[];
  openingCue: string;
}

/** Build the registration artifacts for `state`; `openingTrack` is track-0's resolved cue voicing. */
export function buildRegistration(state: SessionState, openingTrack: CueTrack | undefined): Registration {
  return {
    systemInstruction: buildSystemInstruction({
      title: state.title,
      subtitle: state.subtitle,
      total: state.tracklist.length,
      personalizationContext: state.personalizationContext,
      condition: state.condition,
      hostMode: state.hostMode,
      mood: state.intent.mood,
      scene: state.intent.scene,
    }),
    tools: DJ_TOOLS,
    openingCue: buildCueText({
      kind: "opening",
      hostMode: state.hostMode,
      sessionTitle: state.title,
      now: openingTrack,
    }),
  };
}
