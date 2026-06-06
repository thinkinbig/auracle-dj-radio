import type { Track } from "@auracle/shared";
import { artistVocalDirection } from "../catalog/vocal-prompt.js";

/** Build a MiniMax music prompt from catalog track metadata. */
export function trackToPrompt(track: Track): string {
  const energyHint =
    track.energy <= 2
      ? "soft, minimal, gentle"
      : track.energy <= 3
        ? "moderate intensity, steady groove"
        : track.energy <= 4
          ? "driving, energetic"
          : "peak energy, euphoric";

  const parts = [
    `${track.genre}, ${track.mood}, ${track.tempo} BPM`,
    energyHint,
    `${track.scene} atmosphere`,
    `${track.artist} style`,
  ];

  if (track.instrumental) {
    parts.push(
      "instrumental only, no vocals, no singing",
      "radio-friendly intro, smooth transitions",
    );
  } else {
    parts.push(
      artistVocalDirection(
        {
          name: track.artist,
          punOf: track.punOf ?? "",
          vocalHomage: track.vocalHomage,
          persona: track.artistPersona ?? "",
        },
        { genre: track.genre, mood: track.mood, tempo: track.tempo },
      ),
    );
  }

  if (track.lore) parts.push(track.lore.slice(0, 160));
  return parts.join(", ");
}
