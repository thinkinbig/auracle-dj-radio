/**
 * Declarative catalog of orchestration step names per session flow.
 * Each step must exist as a function in the session modules (see session-flow.test.ts).
 *
 * Entry points:
 * | Flow             | HTTP (runtime)        | DJ tool (tool-runner) | Side effect           |
 * |------------------|-----------------------|-----------------------|-----------------------|
 * | create           | POST /sessions        | —                     | refine (async)        |
 * | nowPlaying       | POST .../now_playing  | —                     | extend, skip-swap     |
 * | replan           | —                     | mood_change           | pushQueueUpdate       |
 * | extend           | POST .../extend       | —                     | from nowPlaying       |
 * | skipTrack        | POST .../skip-track   | skip_track            | pendingSkipAtMs       |
 * | skipSwap         | —                     | skip_track→nowPlaying | —                     |
 * | playlistFeedback | /playlist-feedback    | playlist_feedback     | applyFeedbackEffects / regenerateAndPush |
 */
export const SESSION_FLOW = {
  create: [
    "prepareSessionCreateContext",
    "buildProvisionalPlan",
    "persistProvisionalSession",
    "activateSessionForUser",
    "recordSessionCreated",
    "registerWithProxy",
    "refineSessionCopywriting",
    "supersedeSession",
    "sessionCreateResponse",
  ],
  refine: [
    "buildFullRefinePlan",
    "captureRefineSnapshot",
    "applyFullRefinePlan",
    "pushRefineUpdate",
  ],
  nowPlaying: [
    "applyPlayheadUpdate",
    "settleSkipTransition",
    "startTrackSideEffects",
    "pushNowPlayingContext",
    "pushIntroCue",
    "extendQueue",
    "nowPlayingResponse",
  ],
  extend: [
    "buildExtendContext",
    "requestExtendPlan",
    "applyExtendPlan",
    "pushExtendUpdate",
    "recordQueueExtended",
  ],
  skipSwap: [
    "buildQuickSkipSwapContext",
    "searchQuickSkipReplacements",
    "selectQuickSkipReplacement",
    "applyQuickSkipSwap",
    "pushQuickSkipSwap",
    "recordQuickSkipSwap",
  ],
  replan: [
    "buildReplanContext",
    "requestReplan",
    "applyReplanResult",
    "recordReplan",
    "rememberPersonalizedMoodShift",
    "pushQueueUpdate",
  ],
  playlistFeedback: ["runPlaylistFeedback", "applyFeedbackEffects", "mergeSessionTaste", "regenerateRemaining", "regenerateAndPush"],
  skipTrack: ["runSkipTrack"],
} as const;

export type SessionFlowName = keyof typeof SESSION_FLOW;
