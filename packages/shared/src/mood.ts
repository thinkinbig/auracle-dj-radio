/** Closed-form mood → energy center (ADR-0001). Only `track.energy` enters scoring. */
export const MOOD_ENERGY_CENTER = {
  calm: 1,
  mellow: 2,
  warm: 2.5,
  focused: 3,
  uplifting: 3.5,
  energetic: 4,
  euphoric: 5,
} as const;

export type MoodKey = keyof typeof MOOD_ENERGY_CENTER;

export type MoodEnergyEnvelope = { center: number; min: number; max: number };

export type EnergyPenaltyFn = (energy: number, center: number, k?: number) => number;

/** Default Gaussian steepness — larger k = stricter mood envelope. */
export const DEFAULT_ENERGY_PENALTY_K = 2;

export function moodEnergyCenter(mood: string): number {
  return MOOD_ENERGY_CENTER[mood as MoodKey] ?? 3;
}

/** Soft Gaussian penalty: k · (energy − center)². Returns a non-negative cost. */
export function energyPenalty(energy: number, center: number, k: number = DEFAULT_ENERGY_PENALTY_K): number {
  const delta = energy - center;
  return k * delta * delta;
}

/** Mood-dependent arc bounds — calm stays flat, euphoric rises high. */
export function arcAmplitude(mood: string, k: number = DEFAULT_ENERGY_PENALTY_K): { min: number; max: number } {
  const center = moodEnergyCenter(mood);
  const tolerance = 0.5 + k / 3;
  return { min: Math.max(1, center - tolerance), max: Math.min(5, center + tolerance) };
}

export function moodEnergyEnvelope(mood: string, k: number = DEFAULT_ENERGY_PENALTY_K): MoodEnergyEnvelope {
  const center = moodEnergyCenter(mood);
  const { min, max } = arcAmplitude(mood, k);
  return { center, min, max };
}

/** Per-slot target energies: full session arc within mood envelope; replan glides to floor. */
export function energyTargetsForMood(
  slots: number,
  mood: string,
  lastPlayedEnergy: number | null,
  k: number = DEFAULT_ENERGY_PENALTY_K,
): number[] {
  if (slots <= 0) return [];
  const { min, max } = arcAmplitude(mood, k);

  if (lastPlayedEnergy === null) {
    if (slots === 1) return [Math.round((min + max) / 2)];
    return Array.from({ length: slots }, (_, i) => {
      const t = i / (slots - 1);
      return Math.round(min + (max - min) * t);
    });
  }

  const floor = Math.round(min);
  return Array.from({ length: slots }, (_, i) =>
    Math.round(lastPlayedEnergy + ((floor - lastPlayedEnergy) * (i + 1)) / slots),
  );
}

export type EnergyPickable = { id: string; energy: number };

/** Greedy unique-track fill: mood envelope + per-slot targets; soft penalty escapes starvation. */
export function selectTracksForMoodSlots<T extends EnergyPickable>(
  catalog: T[],
  mood: string,
  slots: number,
  k: number = DEFAULT_ENERGY_PENALTY_K,
): T[] {
  const targets = energyTargetsForMood(slots, mood, null, k);
  const center = moodEnergyCenter(mood);
  const used = new Set<string>();
  const picks: T[] = [];

  for (const target of targets) {
    let best: T | undefined;
    let bestCost = Infinity;
    for (const track of catalog) {
      if (used.has(track.id)) continue;
      const cost = energyPenalty(track.energy, center, k) + 0.25 * energyPenalty(track.energy, target, k);
      if (cost < bestCost) {
        bestCost = cost;
        best = track;
      }
    }
    if (!best) break;
    used.add(best.id);
    picks.push(best);
  }
  return picks;
}

/** Bound implementation of {@link EnergyPenaltyFn} for injection / composition. */
export const energyPenaltyFn: EnergyPenaltyFn = energyPenalty;
