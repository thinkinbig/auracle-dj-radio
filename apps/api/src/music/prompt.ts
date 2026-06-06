import type { Track } from "@auracle/shared";

/** Build a MiniMax music prompt from seed track metadata. */
export function trackToPrompt(track: Track): string {
  const energyHint =
    track.energy <= 2
      ? "soft, minimal, gentle"
      : track.energy <= 3
        ? "moderate intensity, steady groove"
        : track.energy <= 4
          ? "driving, energetic"
          : "peak energy, euphoric";

  return [
    `${track.genre}, ${track.mood}, ${track.tempo} BPM`,
    energyHint,
    `${track.scene} atmosphere`,
    `instrumental only, no vocals, no singing`,
    `radio-friendly intro, smooth transitions`,
  ].join(", ");
}
