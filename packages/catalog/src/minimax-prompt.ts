import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";
import { ARTIST_SONIC_CHARTER } from "./lyria-prompt.js";

export interface MinimaxMusicPromptInput {
  track: CatalogTrack;
  artist: CatalogArtist;
  album: CatalogAlbum;
  sonicBrief?: string;
}

export interface MinimaxMusicPrompt {
  prompt: string;
  isInstrumental: boolean;
  lyrics?: string;
  lyricsOptimizer: boolean;
}

/**
 * MiniMax music-2.6 expects a compact style prompt (not Lyria's narrative blocks).
 * Instrumental: prompt only. Vocal: lyrics required, or lyrics_optimizer from prompt.
 */
export function buildMinimaxMusicPrompt(input: MinimaxMusicPromptInput): MinimaxMusicPrompt {
  const { track, artist, album } = input;
  const charter = ARTIST_SONIC_CHARTER[artist.slug ?? ""] ?? {
    anchor: artist.persona,
    forbid: "generic stock background music",
  };
  const instrumental = track.instrumental !== false;

  const promptParts = [
    `${track.genre}, ${track.mood}, for ${track.scene}`,
    `${track.tempo} BPM, energy ${track.energy}/5`,
    `Lead: ${charter.anchor}`,
    input.sonicBrief,
    `Mood cue: ${track.lore}`,
    `Avoid: ${charter.forbid}`,
  ].filter(Boolean);

  if (instrumental) {
    return {
      prompt: `${promptParts.join(", ")}, instrumental only, no vocals`,
      isInstrumental: true,
      lyricsOptimizer: false,
    };
  }

  if (track.lyrics) {
    return {
      prompt: promptParts.join(", "),
      isInstrumental: false,
      lyrics: track.lyrics,
      lyricsOptimizer: false,
    };
  }

  return {
    prompt: `${promptParts.join(", ")}, ${artist.vocalHomage ?? "expressive fictional vocals"}`,
    isInstrumental: false,
    lyricsOptimizer: true,
  };
}
