import { randomUUID } from "node:crypto";
import type { Condition, PlannedTrack, SessionIntent, TrackSeed } from "@auracle/shared";
import { ANONYMOUS_USER_ID } from "@auracle/shared";
import { buildRegistration } from "../../dj/registration.js";
import type { PlanResponse } from "@auracle/clients";
import { resolveCueTrack } from "../delivery/cue-track.js";
import { pushQueueUpdate } from "../delivery/queue-update.js";
import type { OrchestrationDeps } from "../deps.js";
import { changedIdsFromRemaining } from "../planning/replan.js";
import type { SessionState } from "../state.js";

interface SessionLifecycleLog {
  warn(payload: unknown, message?: string): void;
}

interface SessionPersonalization {
  personalizationContext: string;
}

interface SessionCreateContext extends SessionPersonalization {
  userId: string;
  intent: SessionIntent;
  condition: Condition;
  authenticated: boolean;
  supersededId?: string;
  tieBreakSeed: string;
  seeds?: TrackSeed[];
}

interface RefineSnapshot {
  previousTitle: string;
  previousSubtitle: string;
  previousRemainingIds: string[];
  previousRemainingKey: string;
}

interface RefineOutcome {
  changed: boolean;
  remaining: PlannedTrack[];
  previousRemainingIds: string[];
}

export interface CreateSessionInput extends SessionIntent {
  condition?: Condition;
  /** Listener's gathered external library candidates (ADR-0005); ranked into the same pool. */
  seeds?: TrackSeed[];
  /** Short aggregate Spotify taste summary from the browser; no raw listening history. */
  spotify_taste_summary?: string;
}

export interface CreateSessionDeps extends OrchestrationDeps {
  proxyPublicUrl: string;
  log?: SessionLifecycleLog;
}

export function parseSessionIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

/** Create a playable session quickly, then refine copywriting/planning off path. */
export async function createSession(
  deps: CreateSessionDeps,
  input: CreateSessionInput,
  userId: string,
): Promise<Record<string, unknown>> {
  const context = await prepareSessionCreateContext(deps, input, userId);
  const plan = await buildProvisionalPlan(deps, context);
  const state = persistProvisionalSession(deps, context, plan);

  activateSessionForUser(deps, context, state);
  await recordSessionCreated(deps, state);

  const token = await registerWithProxy(deps, state);
  void refineSessionCopywriting(deps, state);
  if (context.supersededId && context.supersededId !== state.id) void supersedeSession(deps, context.supersededId, userId);

  return sessionCreateResponse(deps, state, token);
}

async function prepareSessionCreateContext(
  deps: CreateSessionDeps,
  input: CreateSessionInput,
  userId: string,
): Promise<SessionCreateContext> {
  const intent = parseSessionIntent(input);
  if (!intent) throw new Error("mood and scene are required");
  const condition: Condition = input.condition ?? (sanitizeSpotifyTasteSummary(input.spotify_taste_summary) ? "C" : "B");
  const authenticated = userId !== ANONYMOUS_USER_ID;
  const supersededId = authenticated ? deps.store.activeSessionForUser(userId) : undefined;
  const personalization = initialPersonalization(condition, input.spotify_taste_summary);
  const tieBreakSeed = randomUUID();
  const seeds = input.seeds?.length ? input.seeds : undefined;

  return {
    userId,
    intent,
    condition,
    authenticated,
    supersededId,
    tieBreakSeed,
    seeds,
    ...personalization,
  };
}

async function buildProvisionalPlan(deps: CreateSessionDeps, context: SessionCreateContext): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: context.intent,
    mode: "provisional",
    memories: context.personalizationContext,
    tieBreakSeed: context.tieBreakSeed,
    seeds: context.seeds,
  });
}

function persistProvisionalSession(deps: CreateSessionDeps, context: SessionCreateContext, plan: PlanResponse): SessionState {
  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  return deps.store.create({
    userId: context.userId,
    intent: context.intent,
    condition: context.condition,
    tieBreakSeed: context.tieBreakSeed,
    title: plan.result.session_title,
    subtitle: plan.result.session_subtitle,
    arc: plan.result.arc,
    tracklist: plan.result.tracklist,
    candidatesById,
    personalizationContext: context.personalizationContext,
    seeds: context.seeds,
  });
}

function activateSessionForUser(deps: CreateSessionDeps, context: SessionCreateContext, state: SessionState): void {
  if (context.authenticated) deps.store.setActiveForUser(context.userId, state.id);
}

async function recordSessionCreated(deps: CreateSessionDeps, state: SessionState): Promise<void> {
  await deps.memory
    .recordEvent(state.id, state.userId, "session_created", { intent: state.intent, condition: state.condition, tracklist: state.tracklist })
    .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "record session_created failed"));
}

function sessionCreateResponse(deps: CreateSessionDeps, state: SessionState, token: string): Record<string, unknown> {
  return {
    session_id: state.id,
    session_title: state.title,
    session_subtitle: state.subtitle,
    host_mode: state.hostMode,
    current_track_index: state.currentTrackIndex,
    tracklist: state.tracklist,
    personalization_context: state.personalizationContext,
    proxy_url: deps.proxyPublicUrl,
    token,
  };
}

function initialPersonalization(condition: Condition, rawSummary: string | undefined): SessionPersonalization {
  if (condition !== "C") return { personalizationContext: "" };
  const spotifySummary = sanitizeSpotifyTasteSummary(rawSummary);
  if (!spotifySummary) throw new Error("condition C requires spotify_taste_summary");
  return { personalizationContext: spotifySummary };
}

function sanitizeSpotifyTasteSummary(rawSummary: string | undefined): string {
  if (!rawSummary || typeof rawSummary !== "string") return "";
  return rawSummary.replace(/\s+/g, " ").trim().slice(0, 900);
}

async function registerWithProxy(deps: CreateSessionDeps, state: SessionState): Promise<string> {
  const openingTrack = await resolveCueTrack(deps.music, state, state.tracklist[0]);
  const registration = buildRegistration(state, openingTrack);
  const token = randomUUID();
  try {
    await deps.proxy.register(state.id, token, registration);
  } catch (err) {
    deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "proxy register failed");
  }
  return token;
}

/**
 * P3.1: start playback from the deterministic tracklist immediately, then let
 * the full planner/copywriter improve title/subtitle/reasons in the background.
 * Already-played/current tracks are never replaced, so the first track can keep
 * playing at full speed while copy lands later.
 */
async function refineSessionCopywriting(deps: CreateSessionDeps, state: SessionState): Promise<void> {
  try {
    // The full plan resolves seed energy + voicing inside music-engine (memoized)
    // and returns fully self-describing slots; the resolved voicing rides the queue
    // update below, so there is no separate inference or voicing push here.
    const plan = await buildFullRefinePlan(deps, state);
    const snapshot = captureRefineSnapshot(deps, state);
    const outcome = applyFullRefinePlan(deps, state, plan, snapshot);

    if (outcome.changed) await pushRefineUpdate(deps, state, outcome);
  } catch (err) {
    deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine failed");
  }
}

async function buildFullRefinePlan(deps: CreateSessionDeps, state: SessionState): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: state.intent,
    mode: "full",
    memories: state.personalizationContext,
    tieBreakSeed: state.tieBreakSeed,
    seeds: state.seeds,
  });
}

function captureRefineSnapshot(deps: CreateSessionDeps, state: SessionState): RefineSnapshot {
  const previousRemainingIds = deps.store.remaining(state).map((r) => r.id);
  return {
    previousTitle: state.title,
    previousSubtitle: state.subtitle,
    previousRemainingIds,
    previousRemainingKey: previousRemainingIds.join(" "),
  };
}

function applyFullRefinePlan(
  deps: CreateSessionDeps,
  state: SessionState,
  plan: PlanResponse,
  snapshot: RefineSnapshot,
): RefineOutcome {
  state.title = plan.result.session_title || state.title;
  state.subtitle = plan.result.session_subtitle || state.subtitle;
  state.arc = plan.result.arc;

  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  const lockedIds = new Set(state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id));
  const current = state.tracklist[state.currentTrackIndex];
  const matchingCurrent = current ? plan.result.tracklist.find((r) => r.id === current.id) : undefined;
  if (current && matchingCurrent) current.reason = matchingCurrent.reason;

  const refinedRemaining = plan.result.tracklist.filter((r) => !lockedIds.has(r.id));
  const remaining = deps.store.replaceRemaining(state, refinedRemaining, candidatesById);
  deps.store.markRefined(state);

  const nextRemainingKey = remaining.map((r) => r.id).join(" ");
  return {
    changed: snapshot.previousTitle !== state.title || snapshot.previousSubtitle !== state.subtitle || snapshot.previousRemainingKey !== nextRemainingKey,
    remaining,
    previousRemainingIds: snapshot.previousRemainingIds,
  };
}

async function pushRefineUpdate(deps: CreateSessionDeps, state: SessionState, outcome: RefineOutcome): Promise<void> {
  await pushQueueUpdate(deps, state, {
    remaining: outcome.remaining,
    changedIds: changedIdsFromRemaining(outcome.previousRemainingIds, outcome.remaining),
    beforeRemainingIds: outcome.previousRemainingIds,
  }).catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine proxy push failed"));
}

async function supersedeSession(deps: CreateSessionDeps, oldId: string, userId: string): Promise<void> {
  const old = deps.store.invalidate(oldId, "session_superseded");
  if (!old) return;
  await deps.memory
    .recordEvent(oldId, userId, "session_superseded", { reason: "new_device" })
    .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: oldId }, "record session_superseded failed"));
  await deps.proxy
    .inject(oldId, { ui_events: [{ type: "session_superseded" }] })
    .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: oldId }, "supersede inject failed"));
}
