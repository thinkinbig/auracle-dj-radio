import type { FlowTrackRef, HostMode } from "@auracle/shared";
import type { Registration } from "../dj/registration.js";
import { buildRegistration } from "../dj/registration.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import { resolveCueTrack } from "./cue-track.js";
import type { SessionStore } from "./store.js";

export interface SessionQueryDeps {
  store: SessionStore;
  music: MusicEngineClient;
}

export interface SessionSnapshot {
  session_id: string;
  session_title: string;
  session_subtitle: string;
  host_mode: HostMode;
  current_track_index: number;
  tracklist: FlowTrackRef[];
  remaining: FlowTrackRef[];
  mem0_context: string;
}

/** The owning user of a live session, or undefined if unknown. Used for the route ownership guard. */
export function sessionOwner(deps: Pick<SessionQueryDeps, "store">, id: string): string | undefined {
  return deps.store.get(id)?.userId;
}

/** Why a session id is gone (e.g. "session_superseded"), for 410 Gone responses. */
export function sessionInvalidationReason(deps: Pick<SessionQueryDeps, "store">, id: string): string | undefined {
  return deps.store.invalidationReason(id);
}

export function sessionSnapshot(deps: Pick<SessionQueryDeps, "store">, id: string): SessionSnapshot | undefined {
  const state = deps.store.get(id);
  if (!state) return undefined;
  return {
    session_id: state.id,
    session_title: state.title,
    session_subtitle: state.subtitle,
    host_mode: state.hostMode,
    current_track_index: state.currentTrackIndex,
    tracklist: state.tracklist,
    remaining: deps.store.remaining(state),
    mem0_context: state.mem0Context,
  };
}

export async function sessionRegistration(deps: SessionQueryDeps, id: string): Promise<Registration | undefined> {
  const state = deps.store.get(id);
  if (!state) return undefined;
  return buildRegistration(state, await resolveCueTrack(deps.music, state, state.tracklist[0]));
}
