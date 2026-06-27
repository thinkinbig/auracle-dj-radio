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
const DEFAULT_TARGET_WEIGHT = 0.25;

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

export type EnergyPickable = { id: string; energy: number };

export interface MoodEnergySequenceOptions<T extends EnergyPickable> {
  profile: MoodEnergyProfile;
  slots: number;
  lastPlayedEnergy?: number | null;
  excludeIds?: ReadonlySet<string>;
  targetWeight?: number;
  transitionPenalty?: (prev: T, cur: T) => number;
}

/** Greedy unique-track fill: mood profile + per-slot targets; soft penalty escapes starvation. */
export function selectMoodEnergySequence<T extends EnergyPickable>(
  catalog: T[],
  options: MoodEnergySequenceOptions<T>,
): T[] {
  const {
    profile,
    slots,
    lastPlayedEnergy = null,
    excludeIds,
    targetWeight = DEFAULT_TARGET_WEIGHT,
    transitionPenalty,
  } = options;
  const targets = profile.targets(slots, lastPlayedEnergy);
  const used = new Set<string>();
  const picks: T[] = [];

  for (const target of targets) {
    let best: T | undefined;
    let bestCost = Infinity;
    for (const track of catalog) {
      if (used.has(track.id)) continue;
      if (excludeIds?.has(track.id)) continue;
      const prev = picks[picks.length - 1];
      const transitionCost = prev && transitionPenalty ? transitionPenalty(prev, track) : 0;
      const cost =
        profile.penalty(track.energy) + targetWeight * profile.targetPenalty(track.energy, target) + transitionCost;
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
