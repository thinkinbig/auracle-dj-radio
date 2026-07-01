import { randomUUID } from "node:crypto";
import type { Condition, Energy, FlowTrackRef, SessionIntent, SpotifyTrackRef, SpotifyVoicing, TastePreference } from "@auracle/shared";
import { ANONYMOUS_USER_ID } from "@auracle/shared";
import { buildRegistration } from "../../dj/registration.js";
import type { PlanResponse } from "../../music-engine-client.js";
import { resolveCueTrack } from "../delivery/cue-track.js";
import type { OrchestrationDeps } from "../deps.js";
import { changedIdsFromRemaining } from "../planning/replan.js";
import type { SessionState } from "../state.js";
import { inferSpotifyEnergy } from "../spotify-energy.js";
import { inferSpotifyVoicing } from "../spotify-voicing.js";

interface SessionLifecycleLog {
  warn(payload: unknown, message?: string): void;
}

interface SessionPersonalization {
  mem0Context: string;
  energyWeights?: Partial<Record<number, number>>;
  taste?: TastePreference[];
}

interface SessionCreateContext extends SessionPersonalization {
  userId: string;
  intent: SessionIntent;
  condition: Condition;
  authenticated: boolean;
  supersededId?: string;
  tieBreakSeed: string;
  spotifyCandidates?: SpotifyTrackRef[];
}

interface RefineSnapshot {
  previousTitle: string;
  previousSubtitle: string;
  previousRemainingIds: string[];
  previousRemainingKey: string;
}

interface RefineOutcome {
  changed: boolean;
  remaining: FlowTrackRef[];
  previousRemainingIds: string[];
}

export interface CreateSessionInput extends SessionIntent {
  condition?: Condition;
  /** Listener's gathered Spotify library candidates (ADR-0005); ranked into the same pool. */
  spotifyCandidates?: SpotifyTrackRef[];
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
  const condition: Condition = input.condition ?? "C";
  const authenticated = userId !== ANONYMOUS_USER_ID;
  const supersededId = authenticated ? deps.store.activeSessionForUser(userId) : undefined;
  const personalization = await initialPersonalization(deps, condition, userId, intent);
  const tieBreakSeed = randomUUID();
  const spotifyCandidates = input.spotifyCandidates?.length ? input.spotifyCandidates : undefined;

  return {
    userId,
    intent,
    condition,
    authenticated,
    supersededId,
    tieBreakSeed,
    spotifyCandidates,
    ...personalization,
  };
}

async function buildProvisionalPlan(deps: CreateSessionDeps, context: SessionCreateContext): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: context.intent,
    mode: "provisional",
    memories: context.mem0Context,
    energyWeights: context.energyWeights,
    taste: context.taste,
    tieBreakSeed: context.tieBreakSeed,
    spotifyCandidates: context.spotifyCandidates,
  });
}

function persistProvisionalSession(deps: CreateSessionDeps, context: SessionCreateContext, plan: PlanResponse): SessionState {
  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  return deps.store.create({
    userId: context.userId,
    intent: context.intent,
    condition: context.condition,
    energyWeights: context.energyWeights,
    taste: context.taste,
    tieBreakSeed: context.tieBreakSeed,
    title: plan.result.session_title,
    subtitle: plan.result.session_subtitle,
    arc: plan.result.arc,
    tracklist: plan.result.tracklist,
    candidatesById,
    mem0Context: context.mem0Context,
    spotifyCandidates: context.spotifyCandidates,
    spotifyMatchedEnergy: plan.spotifyMatchedEnergy,
    spotifyMatchedVoicing: plan.spotifyMatchedVoicing,
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
    mem0_context: state.mem0Context,
    proxy_url: deps.proxyPublicUrl,
    token,
  };
}

async function initialPersonalization(
  deps: CreateSessionDeps,
  condition: Condition,
  userId: string,
  intent: SessionIntent,
): Promise<SessionPersonalization> {
  // Personalization is best-effort and condition-C-only; must not block session create.
  if (condition !== "C") return { mem0Context: "" };
  const [mem0Context, energyWeights, taste] = await Promise.all([
    deps.memory.recallForIntent(userId, intent.mood, intent.scene).catch(() => ""),
    deps.memory.skipRateByEnergy(userId, 10).catch(() => undefined),
    deps.memory.tasteWeights(userId).catch(() => undefined),
  ]);
  return { mem0Context, energyWeights, taste };
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
    const spotifyEnergyByUri = await prepareSpotifyEnergyRefine(state);
    startSpotifyVoicingRefine(deps, state);

    const plan = await buildFullRefinePlan(deps, state, spotifyEnergyByUri);
    const snapshot = captureRefineSnapshot(deps, state);
    const outcome = applyFullRefinePlan(deps, state, plan, snapshot);

    if (outcome.changed) await pushRefineUpdate(deps, state, outcome);
  } catch (err) {
    deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine failed");
  }
}

async function prepareSpotifyEnergyRefine(state: SessionState): Promise<Record<string, Energy> | undefined> {
  const spotifyEnergyByUri = await resolveSpotifyEnergy(state);
  state.spotifyEnergyByUri = spotifyEnergyByUri;
  return spotifyEnergyByUri;
}

function startSpotifyVoicingRefine(deps: CreateSessionDeps, state: SessionState): void {
  void resolveSpotifyVoicing(state).then((voicing) => {
    if (!voicing) return;
    state.spotifyVoicing = voicing;
    void deps.proxy
      .inject(state.id, { ui_events: [{ type: "spotify_voicing", voicing }] })
      .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "spotify voicing push failed"));
  });
}

async function buildFullRefinePlan(
  deps: CreateSessionDeps,
  state: SessionState,
  spotifyEnergyByUri: Record<string, Energy> | undefined,
): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: state.intent,
    mode: "full",
    memories: state.mem0Context,
    energyWeights: state.energyWeights,
    taste: state.taste,
    tieBreakSeed: state.tieBreakSeed,
    spotifyCandidates: state.spotifyCandidates,
    spotifyEnergyByUri,
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
  await deps.proxy
    .inject(state.id, {
      ui_events: [
        {
          type: "tracklist_updated",
          remaining: outcome.remaining,
          changed_ids: changedIdsFromRemaining(outcome.previousRemainingIds, outcome.remaining),
          before_remaining_ids: outcome.previousRemainingIds,
          session_title: state.title,
          session_subtitle: state.subtitle,
        },
      ],
    })
    .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine proxy push failed"));
}

async function resolveSpotifyEnergy(state: SessionState): Promise<Record<string, Energy> | undefined> {
  const candidates = state.spotifyCandidates;
  if (!candidates?.length) return undefined;
  const matched = state.spotifyMatchedEnergy ?? {};
  const unmatched = candidates.filter((c) => matched[c.uri] === undefined);
  const inferred = await inferSpotifyEnergy(unmatched);
  return { ...inferred, ...matched };
}

async function resolveSpotifyVoicing(state: SessionState): Promise<Record<string, SpotifyVoicing> | undefined> {
  const candidates = state.spotifyCandidates;
  if (!candidates?.length) return undefined;
  const matched = state.spotifyMatchedVoicing ?? {};
  const unmatched = candidates.filter((c) => matched[c.uri] === undefined);
  const inferred = await inferSpotifyVoicing(unmatched);
  return { ...inferred, ...matched };
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
