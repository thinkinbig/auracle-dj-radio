import { randomUUID } from "node:crypto";
import type { Condition, Energy, SessionIntent, SpotifyTrackRef, SpotifyVoicing, TastePreference } from "@auracle/shared";
import { ANONYMOUS_USER_ID } from "@auracle/shared";
import { buildRegistration } from "../dj/registration.js";
import { resolveCueTrack } from "./cue-track.js";
import { changedIdsFromRemaining, type OrchestrationDeps } from "./replan.js";
import type { SessionState } from "./store.js";
import { inferSpotifyEnergy } from "./spotify-energy.js";
import { inferSpotifyVoicing } from "./spotify-voicing.js";

interface SessionLifecycleLog {
  warn(payload: unknown, message?: string): void;
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
  const intent = parseSessionIntent(input);
  if (!intent) throw new Error("mood and scene are required");
  const condition: Condition = input.condition ?? "C";
  const authenticated = userId !== ANONYMOUS_USER_ID;
  const supersededId = authenticated ? deps.store.activeSessionForUser(userId) : undefined;

  const [mem0Context, energyWeights, taste] = await initialPersonalization(deps, condition, userId, intent);
  const tieBreakSeed = randomUUID();
  const spotifyCandidates = input.spotifyCandidates?.length ? input.spotifyCandidates : undefined;
  const plan = await deps.music.planTracklist({ intent, mode: "provisional", memories: mem0Context, energyWeights, taste, tieBreakSeed, spotifyCandidates });
  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  const state = deps.store.create({
    userId,
    intent,
    condition,
    energyWeights,
    taste,
    tieBreakSeed,
    title: plan.result.session_title,
    subtitle: plan.result.session_subtitle,
    arc: plan.result.arc,
    tracklist: plan.result.tracklist,
    candidatesById,
    mem0Context,
    spotifyCandidates,
    spotifyMatchedEnergy: plan.spotifyMatchedEnergy,
    spotifyMatchedVoicing: plan.spotifyMatchedVoicing,
  });
  if (authenticated) deps.store.setActiveForUser(userId, state.id);

  await deps.memory
    .recordEvent(state.id, state.userId, "session_created", { intent, condition, tracklist: plan.result.tracklist })
    .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "record session_created failed"));

  const token = await registerWithProxy(deps, state);
  void refineSessionCopywriting(deps, state);

  if (supersededId && supersededId !== state.id) void supersedeSession(deps, supersededId, userId);

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
): Promise<[string, Partial<Record<number, number>> | undefined, TastePreference[] | undefined]> {
  // Personalization is best-effort and condition-C-only; must not block session create.
  if (condition !== "C") return ["", undefined, undefined];
  return Promise.all([
    deps.memory.recallForIntent(userId, intent.mood, intent.scene).catch(() => ""),
    deps.memory.skipRateByEnergy(userId, 10).catch(() => undefined),
    deps.memory.tasteWeights(userId).catch(() => undefined),
  ]);
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
    const spotifyEnergyByUri = await resolveSpotifyEnergy(state);
    state.spotifyEnergyByUri = spotifyEnergyByUri;
    void resolveSpotifyVoicing(state).then((voicing) => {
      if (!voicing) return;
      state.spotifyVoicing = voicing;
      void deps.proxy
        .inject(state.id, { ui_events: [{ type: "spotify_voicing", voicing }] })
        .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "spotify voicing push failed"));
    });
    const plan = await deps.music.planTracklist({
      intent: state.intent,
      mode: "full",
      memories: state.mem0Context,
      energyWeights: state.energyWeights,
      taste: state.taste,
      tieBreakSeed: state.tieBreakSeed,
      spotifyCandidates: state.spotifyCandidates,
      spotifyEnergyByUri,
    });
    const previousTitle = state.title;
    const previousSubtitle = state.subtitle;
    const previousRemainingIds = deps.store.remaining(state).map((r) => r.id);
    const previousRemaining = previousRemainingIds.join(" ");

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

    const nextRemaining = remaining.map((r) => r.id).join(" ");
    const changed = previousTitle !== state.title || previousSubtitle !== state.subtitle || previousRemaining !== nextRemaining;
    if (!changed) return;

    await deps.proxy
      .inject(state.id, {
        ui_events: [
          {
            type: "tracklist_updated",
            remaining,
            changed_ids: changedIdsFromRemaining(previousRemainingIds, remaining),
            before_remaining_ids: previousRemainingIds,
            session_title: state.title,
            session_subtitle: state.subtitle,
          },
        ],
      })
      .catch((err) => deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine proxy push failed"));
  } catch (err) {
    deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine failed");
  }
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
