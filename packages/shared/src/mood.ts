/** Closed-form mood -> energy center (ADR-0001). Only `track.energy` enters scoring. */
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

export interface MoodEnergyProfile {
  mood: string;
  center: number;
  k: number;
  envelope: MoodEnergyEnvelope;
  penalty(energy: number): number;
  targetPenalty(energy: number, target: number): number;
  targets(slots: number, lastPlayedEnergy: number | null): number[];
}

/** Default Gaussian steepness: larger k = stricter mood envelope. */
export const DEFAULT_ENERGY_PENALTY_K = 2;

const MIN_TRACK_ENERGY = 1;
const MAX_TRACK_ENERGY = 5;
const BASE_MOOD_ARC_BOUNDS: Record<MoodKey, { min: number; max: number }> = {
  calm: { min: 1, max: 1.5 },
  mellow: { min: 1, max: 2.5 },
  warm: { min: 1.5, max: 3 },
  focused: { min: 2, max: 4 },
  uplifting: { min: 2.5, max: 4.5 },
  energetic: { min: 3, max: 5 },
  euphoric: { min: 4, max: 5 },
};

export function moodEnergyCenter(mood: string): number {
  return MOOD_ENERGY_CENTER[mood as MoodKey] ?? 3;
}

/** Soft Gaussian penalty: k * (energy - center)^2. Returns a non-negative cost. */
export function energyPenalty(energy: number, center: number, k: number = DEFAULT_ENERGY_PENALTY_K): number {
  const delta = energy - center;
  return k * delta * delta;
}

function clampEnergy(value: number): number {
  return Math.min(MAX_TRACK_ENERGY, Math.max(MIN_TRACK_ENERGY, value));
}

/** Mood-dependent arc bounds: calm stays flat, euphoric rises high. */
export function arcAmplitude(mood: string, k: number = DEFAULT_ENERGY_PENALTY_K): { min: number; max: number } {
  const center = moodEnergyCenter(mood);
  const base = BASE_MOOD_ARC_BOUNDS[mood as MoodKey] ?? BASE_MOOD_ARC_BOUNDS.focused;
  const scale = DEFAULT_ENERGY_PENALTY_K / Math.max(k, 0.01);
  return {
    min: clampEnergy(center - (center - base.min) * scale),
    max: clampEnergy(center + (base.max - center) * scale),
  };
}

export function moodEnergyEnvelope(mood: string, k: number = DEFAULT_ENERGY_PENALTY_K): MoodEnergyEnvelope {
  const center = moodEnergyCenter(mood);
  const { min, max } = arcAmplitude(mood, k);
  return { center, min, max };
}

export function createMoodEnergyProfile(mood: string, k: number = DEFAULT_ENERGY_PENALTY_K): MoodEnergyProfile {
  const envelope = moodEnergyEnvelope(mood, k);
  return {
    mood,
    center: envelope.center,
    k,
    envelope,
    penalty(energy: number): number {
      return energyPenalty(energy, envelope.center, k);
    },
    targetPenalty(energy: number, target: number): number {
      return energyPenalty(energy, target, k);
    },
    targets(slots: number, lastPlayedEnergy: number | null): number[] {
      return energyTargetsFromEnvelope(slots, envelope, lastPlayedEnergy);
    },
  };
}

function energyTargetsFromEnvelope(slots: number, envelope: MoodEnergyEnvelope, lastPlayedEnergy: number | null): number[] {
  if (slots <= 0) return [];
  const { min, max } = envelope;

  if (lastPlayedEnergy === null) {
    if (slots === 1) return [(min + max) / 2];
    return Array.from({ length: slots }, (_, i) => {
      const t = i / (slots - 1);
      return min + (max - min) * t;
    });
  }

  return Array.from({ length: slots }, (_, i) =>
    lastPlayedEnergy + ((min - lastPlayedEnergy) * (i + 1)) / slots,
  );
}

/** Per-slot target energies: full session arc within mood envelope; replan glides to floor. */
export function energyTargetsForMood(
  slots: number,
  mood: string,
  lastPlayedEnergy: number | null,
  k: number = DEFAULT_ENERGY_PENALTY_K,
): number[] {
  return createMoodEnergyProfile(mood, k).targets(slots, lastPlayedEnergy);
}

/** Bound implementation of {@link EnergyPenaltyFn} for injection / composition. */
export const energyPenaltyFn: EnergyPenaltyFn = energyPenalty;
