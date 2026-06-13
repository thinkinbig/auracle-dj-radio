import type { FunctionDeclaration } from "@google/genai";
import type { TrackMeta } from "@auracle/shared";
import type { SessionState } from "../session/store.js";
import { buildCueText, buildSystemInstruction, DJ_TOOLS, toCueTrack } from "./prompt.js";

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

/** Build the registration artifacts for `state`; `openingTrack` is track-0 metadata. */
export function buildRegistration(state: SessionState, openingTrack: TrackMeta | undefined): Registration {
  return {
    systemInstruction: buildSystemInstruction({
      title: state.title,
      subtitle: state.subtitle,
      total: state.tracklist.length,
      mem0Context: state.mem0Context,
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
      now: toCueTrack(openingTrack),
    }),
  };
}
