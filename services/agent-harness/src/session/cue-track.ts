import type { FlowTrackRef } from "@auracle/shared";
import { toCueTrack, type CueTrack } from "../dj/prompt.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { SessionState } from "./store.js";

/** Mid-arc energy for a Spotify slot whose energy isn't resolved yet (mirrors plan.ts). */
const SPOTIFY_PLACEHOLDER_ENERGY = 3;

/**
 * Resolve a tracklist slot to the CueTrack the DJ voices it from, unifying both
 * playback backends (ADR-0005 §5). Local slots resolve through the catalog
 * (`getTrack`). Spotify slots have no catalog entry, so they are built from the
 * inline ref metadata plus this session's resolved voicing — reused verbatim from
 * a matching local track, or LLM-improvised, by the async copywriter (#75). Tempo
 * and genre are unknown for Spotify (audio-features deprecated), so the vibe hint
 * leans on energy alone.
 */
export async function resolveCueTrack(
  music: MusicEngineClient,
  state: SessionState,
  ref: FlowTrackRef | undefined,
): Promise<CueTrack | undefined> {
  if (!ref) return undefined;
  if (ref.source === "spotify" && ref.spotify) {
    const voicing = state.spotifyVoicing?.[ref.spotify.uri];
    return {
      title: ref.spotify.title,
      artist: ref.spotify.artist,
      albumTitle: ref.spotify.albumTitle,
      energy: state.energyById.get(ref.id) ?? SPOTIFY_PLACEHOLDER_ENERGY,
      tempo: 0,
      genre: "",
      lore: voicing?.lore || undefined,
      artistPersona: voicing?.artistPersona || undefined,
      albumConcept: voicing?.albumConcept || undefined,
    };
  }
  return toCueTrack(await music.getTrack(ref.id));
}
