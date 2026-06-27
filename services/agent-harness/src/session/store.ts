import { randomUUID } from "node:crypto";
import type { ArcStage, Condition, FlowTrackRef, HostMode, SessionIntent, TastePreference, TrackCandidate } from "@auracle/shared";
import { inferHostModeFromScene } from "@auracle/shared";

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
  hostMode: HostMode;
  title: string;
  subtitle: string;
  arc: ArcStage;
  tracklist: FlowTrackRef[];
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
}

/** In-memory session state machine. Memory-service is the sole owner of session state. */
export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  create(params: {
    userId: string;
    intent: SessionIntent;
    condition: Condition;
    energyWeights?: Partial<Record<number, number>>;
    taste?: TastePreference[];
    title: string;
    subtitle: string;
    arc: ArcStage;
    tracklist: FlowTrackRef[];
    candidatesById: Map<string, TrackCandidate>;
    mem0Context: string;
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

  /** Slots after the current index, i.e. not yet played. */
  remaining(state: SessionState): FlowTrackRef[] {
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
    state.tracklist[idx] = { id: candidate.id, flow_position: existing.flow_position, reason };
    state.energyById.set(candidate.id, candidate.energy);
    return { before: existing.id, after: candidate.id };
  }

  /**
   * Replace the not-yet-played slots with `newRefs`, keeping played slots and the
   * current track fixed and renumbering flow_position contiguously. Returns the
   * appended (new remaining) refs.
   */
  replaceRemaining(
    state: SessionState,
    newRefs: FlowTrackRef[],
    candidatesById: Map<string, TrackCandidate>,
  ): FlowTrackRef[] {
    const offset = state.currentTrackIndex + 1;
    const kept = state.tracklist.slice(0, offset);
    const appended = [...newRefs]
      .sort((a, b) => a.flow_position - b.flow_position)
      .map((r, i) => ({ id: r.id, flow_position: offset + i + 1, reason: r.reason }));
    state.tracklist = [...kept, ...appended];
    for (const ref of appended) {
      const c = candidatesById.get(ref.id);
      if (c) state.energyById.set(ref.id, c.energy);
    }
    return appended;
  }
}
