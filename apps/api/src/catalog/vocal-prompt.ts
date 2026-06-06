import type { CatalogArtist } from "@auracle/shared";

type VocalTrackHints = {
  genre: string;
  mood: string;
  tempo: number;
};

/**
 * Vocal style prompt for offline music generation.
 * Mirrors cover/photo prompts: evoke the reference **era and technique**, never impersonate a real voice.
 */
export function artistVocalDirection(
  artist: Pick<CatalogArtist, "name" | "punOf" | "vocalHomage" | "persona">,
  track: VocalTrackHints,
): string {
  const punLine = artist.punOf
    ? `Audio parody of ${artist.punOf}. Stage name "${artist.name}". Listeners should recognize the reference era instantly — but this is a fictional original vocalist, never a celebrity voice clone.`
    : "Fictional original vocalist — no celebrity voice impersonation.";

  const homage = artist.vocalHomage
    ? `Vocal era markers: ${artist.vocalHomage}`
    : `Persona: ${artist.persona}`;

  return [
    punLine,
    homage,
    `${track.genre}, ${track.mood}, ${track.tempo} BPM`,
    "full song with vocals, radio-friendly intro",
  ].join(" ");
}
