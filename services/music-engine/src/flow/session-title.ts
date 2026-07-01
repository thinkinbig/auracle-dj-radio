import type { SessionIntent } from "@auracle/shared";

const MOOD_TITLES: Record<string, string[]> = {
  calm: ["Soft Landing", "Low Light Radio", "Quiet Current", "Still Hours"],
  chill: ["Slow Glow", "After Hours Light", "Easy Drift", "Velvet Window"],
  cozy: ["Warm Room", "Lamplight FM", "Close Air", "Sunday Signal"],
  focused: ["Clear Line", "Deep Work Signal", "Steady Current", "Glass Desk"],
  nostalgic: ["Golden Static", "Memory Lane", "Old Photo Radio", "Late Replay"],
  rainy: ["Rain Check", "Window Weather", "Soft Pavement", "Grey Hour"],
  energetic: ["Lift Off", "Bright Circuit", "Pulse Run", "High Motion"],
  euphoric: ["Skyline Rush", "Peak Bloom", "Neon Lift", "Open Floor"],
};

const SCENE_WORDS: Record<string, string[]> = {
  chill: ["Lounge", "Porch", "Window", "Room"],
  commute: ["Route", "Street", "Platform", "Drive"],
  focus: ["Signal", "Desk", "Line", "Thread"],
  gym: ["Pulse", "Circuit", "Rep", "Drive"],
  party: ["Floor", "Neon", "Afterparty", "Lift"],
  study: ["Desk", "Lamp", "Pages", "Library"],
};

const FALLBACK_ADJECTIVES = ["Late", "Soft", "Open", "Quiet", "Warm", "Bright", "Low"];
const FALLBACK_NOUNS = ["Signal", "Room", "Current", "Window", "Frequency", "Drift", "Hours"];

export function createSessionTitle(intent: SessionIntent, seed = ""): string {
  const mood = normalize(intent.mood);
  const scene = normalize(intent.scene);
  const pool = [...(MOOD_TITLES[mood] ?? []), ...sceneTitles(mood, scene)];
  if (pool.length > 0) return pool[pickIndex(`${seed}:${mood}:${scene}:${intent.duration_min}`, pool.length)]!;

  const adjective = FALLBACK_ADJECTIVES[pickIndex(`${seed}:${mood}:adj`, FALLBACK_ADJECTIVES.length)]!;
  const noun = FALLBACK_NOUNS[pickIndex(`${seed}:${scene}:noun`, FALLBACK_NOUNS.length)]!;
  return `${adjective} ${noun}`;
}

function sceneTitles(mood: string, scene: string): string[] {
  const words = SCENE_WORDS[scene];
  if (!words?.length) return [];
  const tone = titleWord(mood);
  return words.map((word) => `${tone} ${word}`);
}

function titleWord(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "_");
}

function pickIndex(key: string, length: number): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % length;
}
