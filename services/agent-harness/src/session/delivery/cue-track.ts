import type { PlannedTrack } from "@auracle/shared";
import { toCueTrack, type CueTrack } from "../../dj/prompt.js";
import type { MusicEngineClient } from "@auracle/clients";
import type { SessionState } from "../state.js";

/**
 * Resolve a tracklist slot to the CueTrack the DJ voices it from. A catalog
 * (`local:`) slot resolves through the catalog (`getTrack`) for its full metadata;
 * any other slot is self-describing — the planner stamped its inline metadata and
 * resolved voicing (reused from a matching catalog track, or LLM-improvised, #75) —
 * so the cue is built straight from the slot. Tempo/genre are unknown for external
 * tracks, so the vibe hint leans on energy alone.
 */
export async function resolveCueTrack(
  music: MusicEngineClient,
  _state: SessionState,
  ref: PlannedTrack | undefined,
): Promise<CueTrack | undefined> {
  if (!ref) return undefined;
  if (ref.uri.startsWith("local:")) {
    return toCueTrack(await music.getTrack(ref.id));
  }
  return {
    title: ref.title,
    artist: ref.artist,
    albumTitle: ref.albumTitle,
    energy: ref.energy,
    tempo: 0,
    genre: "",
    lore: ref.voicing.lore || undefined,
    artistPersona: ref.voicing.artistPersona || undefined,
    albumConcept: ref.voicing.albumConcept || undefined,
  };
}
