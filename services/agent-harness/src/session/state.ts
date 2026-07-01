import { randomUUID } from "node:crypto";
import type { ArcStage, Condition, Energy, HostMode, PlannedTrack, SessionIntent, TastePreference, TrackCandidate, TrackSeed, Voicing } from "@auracle/shared";
import { inferHostModeFromScene } from "@auracle/shared";

const EMPTY_VOICING: Voicing = { artistPersona: "", albumConcept: "", lore: "" };

/** Build a minimal self-describing local slot from a lean candidate (skip-swap). The
 * client enriches local metadata by id (uri scheme `local:`), so inline is best-effort. */
function localSlot(id: string, flow_position: number, reason: string, energy: Energy): PlannedTrack {
  return {
    id,
    uri: `local:${id}`,
    flow_position,
    reason,
    title: "",
    artist: "",
    albumTitle: "",
    albumCoverUrl: "",
    durationSec: 0,
    energy,
    voicing: EMPTY_VOICING,
  };
}

export interface SessionState {
  id: string;
  /** Memory/analytics identity: the authed user, or `auracle_anonymous` for demo. */
  userId: string;
  intent: SessionIntent;
  condition: Condition;
  /** Skip-energy penalty weights for this user (condition C only); reused by replan. */
  energyWeights?: Partial<Record<number, number>>;
  /** Structured taste prefer/avoid for this user (condition C only); reused by replan. */
  taste?: TastePreference[];
  tieBreakSeed: string;
  /** Listener's gathered external library pool (ADR-0005); re-sent to music-engine on the refine/replan/extend re-rank, static per session. Energy/voicing resolution now lives in music-engine (memoized), so the harness holds only the raw seeds. */
  seeds?: TrackSeed[];
  hostMode: HostMode;
  title: string;
  subtitle: string;
  arc: ArcStage;
  tracklist: PlannedTrack[];
  /** 0-based index of the currently playing slot. */
  currentTrackIndex: number;
  playedTrackIds: string[];
  /** Energy of each planned track, by id — used to seed replan. */
  energyById: Map<string, number>;
  mem0Context: string;
  /** True once the background LLM plan refine has replaced the provisional arc. */
  planRefined: boolean;
  /** Async-push subscribers (Lane 3), notified when the refine lands (replayed if late). */
  refineListeners: Set<() => void>;
  /** Set when skip_track fires; cleared by the next now_playing to time the skip round trip. */
  pendingSkipAtMs?: number;
  /** Brief guard for duplicate tool bursts where a pure skip is also misread as mood_change. */
  skipOnlyUntilMs?: number;
  /** Timestamp (ms) when the current track started; set by now_playing. Used to measure listen time before a skip. */
  trackStartedAtMs?: number;
  /** Current run of quick skips at the same energy, used for high-signal mem0 writes. */
  quickSkipRun?: { energy: number; count: number };
  /** Energies already written to mem0 for repeated quick skips in this session. */
  rememberedQuickSkipEnergies: Set<number>;
  /** Debounce flag: true while a rolling extend (E1) is in flight, to avoid append storms. */
  extendPending?: boolean;
}

export interface SessionStateView {
  id: string;
  userId: string;
  condition: Condition;
  hostMode: HostMode;
  title: string;
  subtitle: string;
  arc: ArcStage;
  currentTrackIndex: number;
  tracklist: ReadonlyArray<PlannedTrack>;
  remaining: ReadonlyArray<PlannedTrack>;
  mem0Context: string;
  planRefined: boolean;
}

export function sessionStateView(state: SessionState, remaining: ReadonlyArray<PlannedTrack>): SessionStateView {
  return {
    id: state.id,
    userId: state.userId,
    condition: state.condition,
    hostMode: state.hostMode,
    title: state.title,
    subtitle: state.subtitle,
    arc: state.arc,
    currentTrackIndex: state.currentTrackIndex,
    tracklist: state.tracklist,
    remaining,
    mem0Context: state.mem0Context,
    planRefined: state.planRefined,
  };
}

/** In-memory session state machine. Memory-service is the sole owner of session state. */
export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();
  /**
   * Authenticated userId → their single live session id, so a new device can
   * find and supersede the prior session (issue #55). Guests are never indexed
   * — they share the anonymous id and must not supersede each other.
   */
  private readonly activeByUser = new Map<string, string>();
  /**
   * Recently invalidated session ids → reason, so their APIs answer 410 Gone
   * instead of an ambiguous 404. Capped to bound memory on a long-lived host.
   */
  private readonly invalidated = new Map<string, string>();
  private static readonly INVALIDATED_CAP = 256;

  create(params: {
    userId: string;
    intent: SessionIntent;
    condition: Condition;
    energyWeights?: Partial<Record<number, number>>;
    taste?: TastePreference[];
    tieBreakSeed: string;
    title: string;
    subtitle: string;
    arc: ArcStage;
    tracklist: PlannedTrack[];
    candidatesById: Map<string, TrackCandidate>;
    mem0Context: string;
    seeds?: TrackSeed[];
  }): SessionState {
    const energyById = new Map<string, number>();
    for (const ref of params.tracklist) {
      const c = params.candidatesById.get(ref.id);
      if (c) energyById.set(ref.id, c.energy);
    }
    const state: SessionState = {
      id: randomUUID(),
      userId: params.userId,
      intent: params.intent,
      condition: params.condition,
      energyWeights: params.energyWeights,
      taste: params.taste,
      tieBreakSeed: params.tieBreakSeed,
      seeds: params.seeds,
      hostMode: inferHostModeFromScene(params.intent.scene),
      title: params.title,
      subtitle: params.subtitle,
      arc: params.arc,
      tracklist: params.tracklist,
      currentTrackIndex: 0,
      playedTrackIds: [],
      energyById,
      mem0Context: params.mem0Context,
      planRefined: false,
      refineListeners: new Set(),
      rememberedQuickSkipEnergies: new Set(),
    };
    this.sessions.set(state.id, state);
    return state;
  }

  /** Apply the background plan refine: mark refined and notify subscribers (Lane 3). */
  markRefined(state: SessionState): void {
    state.planRefined = true;
    for (const listener of [...state.refineListeners]) listener();
  }

  /** Subscribe to the plan refine; fires immediately if already refined. Returns unsubscribe. */
  subscribeRefine(state: SessionState, listener: () => void): () => void {
    if (state.planRefined) {
      listener();
      return () => {};
    }
    state.refineListeners.add(listener);
    return () => {
      state.refineListeners.delete(listener);
    };
  }

  get(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  /** Record this authenticated user's single live session (guests excluded by the caller). */
  setActiveForUser(userId: string, sessionId: string): void {
    this.activeByUser.set(userId, sessionId);
  }

  /** The user's current live session id, if any. */
  activeSessionForUser(userId: string): string | undefined {
    return this.activeByUser.get(userId);
  }

  /**
   * Drop a session and remember why, so its APIs return 410 Gone. The user
   * index entry is cleared only if it still points at this session — a newer
   * session for the same user (the supersedor) must keep its mapping.
   */
  invalidate(sessionId: string, reason: string): SessionState | undefined {
    const state = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (state && this.activeByUser.get(state.userId) === sessionId) {
      this.activeByUser.delete(state.userId);
    }
    this.invalidated.set(sessionId, reason);
    if (this.invalidated.size > SessionStore.INVALIDATED_CAP) {
      const oldest = this.invalidated.keys().next().value;
      if (oldest !== undefined) this.invalidated.delete(oldest);
    }
    return state;
  }

  /** Why a session id is gone (e.g. "session_superseded"), or undefined if never invalidated. */
  invalidationReason(sessionId: string): string | undefined {
    return this.invalidated.get(sessionId);
  }

  /** Slots after the current index, i.e. not yet played. */
  remaining(state: SessionState): PlannedTrack[] {
    return state.tracklist.slice(state.currentTrackIndex + 1);
  }

  /** Energy of the track at the current pointer, if known. */
  currentEnergy(state: SessionState): number | null {
    const cur = state.tracklist[state.currentTrackIndex];
    return cur ? (state.energyById.get(cur.id) ?? null) : null;
  }

  /**
   * Web reports that `trackId` started playing (the browser is the sole playhead
   * writer; memory-service mirrors it). Moves the pointer there and marks every
   * earlier slot played. Idempotent; false if unknown.
   */
  markStarted(state: SessionState, trackId: string): boolean {
    const idx = state.tracklist.findIndex((r) => r.id === trackId);
    if (idx < 0) return false;
    state.currentTrackIndex = idx;
    state.playedTrackIds = state.tracklist.slice(0, idx).map((r) => r.id);
    return true;
  }

  /**
   * Swap just the next not-yet-played slot (remaining[0]) for `candidate`, keeping
   * its flow_position and the rest of the queue fixed. Used by the deterministic
   * skip-swap (E4) — a single-slot surgery, not a remaining-wide replan. Returns
   * the swapped-out/in ids, or null if there is no next slot.
   */
  swapNext(
    state: SessionState,
    candidate: TrackCandidate,
    reason: string,
  ): { before: string; after: string } | null {
    const idx = state.currentTrackIndex + 1;
    const existing = state.tracklist[idx];
    if (!existing) return null;
    // Skip-swap always brings in a fresh catalog (local) track; the client enriches
    // its metadata by id, so a minimal self-describing local slot is enough here.
    state.tracklist[idx] = localSlot(candidate.id, existing.flow_position, reason, candidate.energy);
    state.energyById.set(candidate.id, candidate.energy);
    return { before: existing.id, after: candidate.id };
  }

  /**
   * Replace a contiguous `window` of the not-yet-played slots with `newRefs`,
   * keeping played slots and the current track fixed and renumbering flow_position
   * contiguously. The window is `{ start, count }` measured within the remaining
   * queue: nudge (E2) passes `{ count: 1–2 }` (replace the front, keep the tail);
   * steer (E5) passes `{ start: ~half }` (keep the head, replace the latter half);
   * omitting `window` replaces the whole remaining queue (full / regenerate). Fresh
   * refs are capped to the window and de-duplicated against the kept head + tail.
   * Returns the new remaining queue.
   */
  replaceRemaining(
    state: SessionState,
    newRefs: PlannedTrack[],
    candidatesById: Map<string, TrackCandidate>,
    window?: { start?: number; count?: number },
  ): PlannedTrack[] {
    const offset = state.currentTrackIndex + 1;
    const head = state.tracklist.slice(0, offset);
    const remaining = state.tracklist.slice(offset);
    const start = Math.max(0, Math.min(window?.start ?? 0, remaining.length));
    const count = Math.max(0, Math.min(window?.count ?? remaining.length - start, remaining.length - start));
    const keptHead = remaining.slice(0, start);
    const keptTail = remaining.slice(start + count);
    const keptIds = new Set([...keptHead, ...keptTail].map((r) => r.id));
    const fresh = [...newRefs]
      .filter((r) => !keptIds.has(r.id))
      .sort((a, b) => a.flow_position - b.flow_position)
      .slice(0, count);
    const merged = [...keptHead, ...fresh, ...keptTail].map((r, i) => ({ ...r, flow_position: offset + i + 1 }));
    state.tracklist = [...head, ...merged];
    for (const ref of fresh) {
      const c = candidatesById.get(ref.id);
      if (c) state.energyById.set(ref.id, c.energy);
    }
    return merged;
  }

  /**
   * Append `newRefs` after the queue tail (rolling extend, E1) — grow-only: played
   * slots, the current track and existing remaining stay fixed. Skips ids already
   * in the tracklist (dedup) and renumbers flow_position contiguously from the tail.
   * Returns the appended refs (empty if all were duplicates).
   */
  appendTracks(
    state: SessionState,
    newRefs: PlannedTrack[],
    candidatesById: Map<string, TrackCandidate>,
  ): PlannedTrack[] {
    const existing = new Set(state.tracklist.map((r) => r.id));
    const base = state.tracklist.length;
    const appended = [...newRefs]
      .filter((r) => !existing.has(r.id))
      .sort((a, b) => a.flow_position - b.flow_position)
      .map((r, i) => ({ ...r, flow_position: base + i + 1 }));
    state.tracklist = [...state.tracklist, ...appended];
    for (const ref of appended) {
      const c = candidatesById.get(ref.id);
      if (c) state.energyById.set(ref.id, c.energy);
    }
    return appended;
  }
}
