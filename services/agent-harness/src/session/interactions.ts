import type { PlaylistFeedbackSource, RegenerateSessionResponse } from "@auracle/shared";
import { parsePlaylistFeedback, runPlaylistFeedback, type PlaylistFeedbackOutcome } from "./playlist-feedback.js";
import type { OrchestrationDeps } from "./replan.js";
import { runTool, type ToolCall, type ToolEnvelope } from "./tool-runner.js";

/** Run a Gemini Live tool call against a live session, if it still exists. */
export async function runSessionTool(
  deps: OrchestrationDeps,
  sessionId: string,
  call: ToolCall,
): Promise<ToolEnvelope | undefined> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  return runTool(deps, state, call);
}

/** Single session-id entrypoint for UI and DJ playlist feedback. */
export async function applyPlaylistFeedback(
  deps: OrchestrationDeps,
  sessionId: string,
  feedback: unknown,
  source: PlaylistFeedbackSource,
): Promise<PlaylistFeedbackOutcome | undefined | false> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  const parsed = parsePlaylistFeedback(feedback);
  if (!parsed) return false;
  return runPlaylistFeedback(deps, state, parsed, source);
}

/** UI regenerate is the explicit playlist-feedback regenerate path. */
export async function regenerateQueue(
  deps: OrchestrationDeps,
  sessionId: string,
): Promise<RegenerateSessionResponse | undefined> {
  const outcome = await applyPlaylistFeedback(deps, sessionId, "regenerate", "ui");
  if (!outcome) return undefined;
  return outcome.regenerate;
}
