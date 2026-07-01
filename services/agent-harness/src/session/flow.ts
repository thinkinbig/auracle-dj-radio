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
  nowPlaying: [
    "applyPlayheadUpdate",
    "settleSkipTransition",
    "startTrackSideEffects",
    "pushNowPlayingContext",
    "pushIntroCue",
    "extendQueue",
    "nowPlayingResponse",
  ],
  replan: [
    "buildReplanContext",
    "requestReplan",
    "applyReplanResult",
    "recordReplan",
    "rememberPersonalizedMoodShift",
    "pushQueueUpdate",
  ],
} as const;

export type SessionFlowName = keyof typeof SESSION_FLOW;
