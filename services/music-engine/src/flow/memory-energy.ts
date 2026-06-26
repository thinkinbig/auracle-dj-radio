type EnergyWeights = Partial<Record<number, number>>;

const MAX_WEIGHT = 0.7;

function setMax(weights: EnergyWeights, energy: number, value: number): void {
  weights[energy] = Math.max(weights[energy] ?? 0, Math.min(MAX_WEIGHT, value));
}

/** Convert high-signal mem0 preference facts into deterministic retrieval penalties. */
export function energyWeightsFromMemories(memories: string): EnergyWeights | undefined {
  const text = memories.toLowerCase();
  if (!text.trim()) return undefined;

  const weights: EnergyWeights = {};
  if (/\b(lighter|lower|calmer|gentler|softer)\s+energy\b/.test(text) || /\bprefer[s]?\s+(calmer|gentler|softer)\b/.test(text)) {
    setMax(weights, 5, 0.7);
    setMax(weights, 4, 0.45);
  }
  if (/\b(higher|heavier)\s+energy\b/.test(text) || /\b(more energetic|higher intensity|more intense)\b/.test(text)) {
    setMax(weights, 1, 0.7);
    setMax(weights, 2, 0.45);
  }

  for (const match of text.matchAll(/\b(?:avoid|skipped|skip|dislike[s]?)\s+energy\s+([1-5])\b/g)) {
    setMax(weights, Number(match[1]), 0.7);
  }

  return Object.keys(weights).length > 0 ? weights : undefined;
}

/** Merge penalty maps without double-counting the same semantic signal. */
export function mergeEnergyWeights(...maps: (EnergyWeights | undefined)[]): EnergyWeights | undefined {
  const merged: EnergyWeights = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [energy, weight] of Object.entries(map)) {
      if (weight == null) continue;
      setMax(merged, Number(energy), weight);
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
