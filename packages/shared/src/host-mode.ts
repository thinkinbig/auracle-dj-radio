/** Live DJ voice archetype — swappable independently of playlist replan. */
export type HostMode = "set_dj" | "curator" | "hype" | "minimal";

export const HOST_MODES: readonly HostMode[] = ["set_dj", "curator", "hype", "minimal"];

export function parseHostMode(value: unknown): HostMode | null {
  if (typeof value !== "string") return null;
  return HOST_MODES.includes(value as HostMode) ? (value as HostMode) : null;
}

/** Default host mode from scene until the human mood flow overrides it. */
export function inferHostModeFromScene(scene: string): HostMode {
  const s = scene.toLowerCase();
  if (s.includes("gym") || s.includes("run") || s.includes("workout")) return "hype";
  if (s.includes("study") || s.includes("focus") || s.includes("sleep")) return "minimal";
  if (s.includes("commute") || s.includes("cook") || s.includes("drive")) return "curator";
  return "set_dj";
}
