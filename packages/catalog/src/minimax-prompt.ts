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

const LEAD_BY_GENRE: Record<string, string> = {
  ambient: "bowed pads, soft granular texture, minimal percussion",
  "lo-fi": "detuned Rhodes, muted piano, dusty drum break",
  downtempo: "warm bass, mallet motif, slow breakbeat",
  chillhop: "jazz guitar chops, muted piano, mellow boom-bap drums",
  jazztronica: "Rhodes stabs, live bass, brushed electronic drums",
  "deep-house": "warm sub bass, filtered chord stabs, tight house groove",
  "nu-disco": "octave disco bass, live shaker, bright rhythm guitar",
  house: "punchy kick, open hats, chord stabs, rolling bassline",
  synthwave: "arpeggiated Juno lead, analog bass, gated snare",
  "future-garage": "shuffled two-step drums, sub bass, detuned vocal chops",
  "afro-house": "log-drum sub bass, hand percussion, shakers, marimba plucks",
  "k-pop": "tight pop drums, bright synth brass, stacked chant hooks, polished girl-group mix",
  mecha: "orchestral brass, taiko drums, cinematic synth arpeggios, choir stabs",
  phonk: "Memphis cowbell, distorted 808 bass, dark trap hats, drift-phonk rhythm",
  dnb: "reese bass, amen break chops, fast breakbeat drums, neurofunk synth stabs",
};

const SCENE_ATMOSPHERE: Record<string, string> = {
  study: "late-night desk focus, intimate headphone mix, low distraction",
  chill: "relaxed unwind, soft room ambience, unhurried movement",
  commute: "forward motion, city rhythm, transitional energy",
  focus: "deep work, steady pulse, clean repetition",
  gym: "athletic momentum, high drive, clear downbeat",
  party: "peak-hour dancefloor, celebratory lift, memorable hook",
};

function structureForEnergy(energy: CatalogTrack["energy"], instrumental: boolean): string {
  if (energy <= 2) {
    return instrumental
      ? "intro with sparse motif, gentle groove, subtle mid-song lift, calm outro"
      : "short intro, verse, soft hook, second verse, restrained chorus, clean outro";
  }
  if (energy === 3) {
    return instrumental
      ? "intro, full groove, melodic hook, breakdown, final hook, outro"
      : "intro, verse, pre-chorus, chorus, verse, chorus, outro";
  }
  return instrumental
    ? "immediate pulse, driving groove, build, peak hook, high-energy outro"
    : "short intro, verse, pre-chorus build, anthemic chorus, second chorus, outro";
}

function mixTarget(energy: CatalogTrack["energy"]): string {
  if (energy <= 2) return "warm, polished, wide but soft, no harsh highs, no muddy low end";
  if (energy === 3) return "balanced, radio-ready, clear drums, warm low end, defined lead";
  return "punchy, loud, club-ready, tight low end, bright but not harsh";
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
  const genreLabel = track.genreSlug ?? track.genre;
  const genreTags = genreLabel === track.genre ? genreLabel : `${genreLabel}, ${track.genre}`;
  const lead = LEAD_BY_GENRE[genreLabel] ?? "distinct lead instrument, memorable motif";
  const sceneFeel = SCENE_ATMOSPHERE[track.scene] ?? track.scene;
  const vocalDirection =
    artist.vocalHomage ??
    "expressive fictional vocal, confident phrasing, natural performance, no real-person imitation";

  const promptParts = [
    `${genreTags}, ${track.mood}, ${sceneFeel}`,
    `${track.tempo} BPM, energy ${track.energy}/5`,
    `Instrumentation: ${lead}`,
    `Artist sonic identity: ${charter.anchor}`,
    `Song structure: ${structureForEnergy(track.energy, instrumental)}`,
    `Production: ${mixTarget(track.energy)}, full arrangement, finished master`,
    input.sonicBrief,
    `Theme: ${track.title}; ${album.concept}; ${track.lore}`,
    `Avoid: ${charter.forbid}`,
  ].filter(Boolean);

  if (instrumental) {
    return {
      prompt: `${promptParts.join(", ")}, instrumental only, no vocals, no lyrics, no spoken words`,
      isInstrumental: true,
      lyricsOptimizer: false,
    };
  }

  if (track.lyrics) {
    return {
      prompt: `${promptParts.join(", ")}, Vocal delivery: ${vocalDirection}`,
      isInstrumental: false,
      lyrics: track.lyrics,
      lyricsOptimizer: false,
    };
  }

  return {
    prompt: `${promptParts.join(", ")}, Vocal delivery: ${vocalDirection}, write coherent original lyrics matching the theme`,
    isInstrumental: false,
    lyricsOptimizer: true,
  };
}
