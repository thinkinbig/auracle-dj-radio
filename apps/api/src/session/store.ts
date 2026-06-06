import { randomUUID } from "node:crypto";
import type { ArcStage, Condition, FlowTrackRef, HostMode, SessionIntent, TrackCandidate } from "@auracle/shared";
import { inferHostModeFromScene } from "@auracle/shared";

export interface SessionState {
  id: string;
  intent: SessionIntent;
  condition: Condition;
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
}

/** In-memory session state machine (doc: Demo 不持久化 plan). */
export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  create(params: {
    intent: SessionIntent;
    condition: Condition;
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
      intent: params.intent,
      condition: params.condition,
      hostMode: inferHostModeFromScene(params.intent.scene),
      title: params.title,
      subtitle: params.subtitle,
      arc: params.arc,
      tracklist: params.tracklist,
      currentTrackIndex: 0,
      playedTrackIds: [],
      energyById,
      mem0Context: params.mem0Context,
    };
    this.sessions.set(state.id, state);
    return state;
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
   * Web reports that `trackId` started playing. Moves the pointer there and
   * marks every earlier slot as played. Idempotent; false if unknown.
   */
  markStarted(state: SessionState, trackId: string): boolean {
    const idx = state.tracklist.findIndex((r) => r.id === trackId);
    if (idx < 0) return false;
    state.currentTrackIndex = idx;
    state.playedTrackIds = state.tracklist.slice(0, idx).map((r) => r.id);
    return true;
  }

  /**
   * Replace the not-yet-played slots with `newRefs`, keeping played slots and
   * the current track fixed and renumbering flow_position contiguously.
   * Returns the appended (new remaining) refs.
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
