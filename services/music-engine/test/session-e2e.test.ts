/**
 * P5.2: E2E regression — full session generation against the real catalog.
 * Uses manifestToTracks() so assertions catch regressions in actual catalog
 * content, not just synthetic data shaped to pass.
 */
import { describe, expect, it } from "vitest";
import { manifestToTracks, loadCatalogManifest } from "../src/catalog/manifest.js";
import { createPlan, replan, type PlanDeps } from "../src/flow/plan.js";

const realTracks = manifestToTracks(loadCatalogManifest());
const deps: PlanDeps = { tracks: () => realTracks };

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

async function planEnergies(mood: string, scene: string): Promise<number[]> {
  const { result, candidatesById } = await createPlan(deps, { mood, scene, duration_min: 25 });
  return result.tracklist.map((ref) => candidatesById.get(ref.id)!.energy);
}

// ── Calm sessions ─────────────────────────────────────────────────────────────

describe("calm sessions", () => {
  it("calm/study: median energy ≤ 2", async () => {
    const energies = await planEnergies("calm", "study");
    expect(energies.length).toBeGreaterThan(0);
    expect(median(energies)).toBeLessThanOrEqual(2);
  });

  it("calm/chill: median energy ≤ 2", async () => {
    const energies = await planEnergies("calm", "chill");
    expect(median(energies)).toBeLessThanOrEqual(2);
  });

  it("calm/study: never selects energy 4 or 5", async () => {
    // real catalog has 9 e1 + 23 e2 tracks; energy 4-5 won't enter the top-24 candidate pool
    const energies = await planEnergies("calm", "study");
    expect(energies.every((e) => e <= 3)).toBe(true);
  });

  it("calm session: all 8 slots filled from real catalog", async () => {
    const { result } = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });
    expect(result.tracklist.length).toBe(8);
  });
});

// ── Euphoric sessions ─────────────────────────────────────────────────────────

describe("euphoric sessions", () => {
  it("euphoric/party: max energy ≥ 4", async () => {
    const energies = await planEnergies("euphoric", "party");
    expect(Math.max(...energies)).toBeGreaterThanOrEqual(4);
  });

  it("euphoric/gym: max energy ≥ 4", async () => {
    const energies = await planEnergies("euphoric", "gym");
    expect(Math.max(...energies)).toBeGreaterThanOrEqual(4);
  });

  it("euphoric/party: includes energy 5 (real catalog has 14 party+e5 tracks)", async () => {
    const energies = await planEnergies("euphoric", "party");
    expect(energies.some((e) => e === 5)).toBe(true);
  });

  it("euphoric session: all 8 slots filled", async () => {
    const { result } = await createPlan(deps, { mood: "euphoric", scene: "party", duration_min: 25 });
    expect(result.tracklist.length).toBe(8);
  });
});

// ── Mid-energy moods ──────────────────────────────────────────────────────────

describe("mid-energy moods", () => {
  it("energetic/gym: max energy ≥ 4 (real catalog: 13 gym@e4 + 4 gym@e5)", async () => {
    const energies = await planEnergies("energetic", "gym");
    expect(Math.max(...energies)).toBeGreaterThanOrEqual(4);
  });

  it("focused/study: median energy in [2, 4]", async () => {
    const energies = await planEnergies("focused", "study");
    const m = median(energies);
    expect(m).toBeGreaterThanOrEqual(2);
    expect(m).toBeLessThanOrEqual(4);
  });

  it("mellow/chill: median energy ≤ 3", async () => {
    const energies = await planEnergies("mellow", "chill");
    expect(median(energies)).toBeLessThanOrEqual(3);
  });
});

// ── Arc shape ─────────────────────────────────────────────────────────────────

describe("arc shape matches mood", () => {
  it("calm arc: max energy ≤ 2 (only e1+e2 tracks reach the top-24 candidate pool)", async () => {
    const energies = await planEnergies("calm", "study");
    expect(Math.max(...energies)).toBeLessThanOrEqual(2);
  });

  it("euphoric arc: first 4 tracks include at least one energy ≥ 4", async () => {
    const energies = await planEnergies("euphoric", "party");
    expect(energies.slice(0, 4).some((e) => e >= 4)).toBe(true);
  });

  it("session_title is non-empty", async () => {
    const { result } = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });
    expect(result.session_title.length).toBeGreaterThan(0);
  });

  it("flow_position is contiguous from 1", async () => {
    const { result } = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });
    result.tracklist.forEach((ref, i) => expect(ref.flow_position).toBe(i + 1));
  });

  it("no duplicate track IDs across calm, euphoric, and focused sessions", async () => {
    for (const [mood, scene] of [["calm", "study"], ["euphoric", "party"], ["focused", "study"]]) {
      const { result } = await createPlan(deps, { mood: mood!, scene: scene!, duration_min: 25 });
      const ids = result.tracklist.map((r) => r.id);
      expect(new Set(ids).size, `${mood}/${scene} duplicate IDs`).toBe(ids.length);
    }
  });

  it("all returned track IDs exist in the real catalog", async () => {
    const catalogIds = new Set(realTracks.map((t) => t.id));
    const { result } = await createPlan(deps, { mood: "calm", scene: "study", duration_min: 25 });
    for (const ref of result.tracklist) {
      expect(catalogIds.has(ref.id), `unknown id: ${ref.id}`).toBe(true);
    }
  });
});

// ── Replan glide ──────────────────────────────────────────────────────────────

describe("replan glides smoothly", () => {
  it("calm replan from energy=5: targets interpolate down so last pick ≤ first pick", async () => {
    const { result, candidatesById } = await replan(deps, {
      intent: { mood: "calm", scene: "study", duration_min: 25 },
      playedIds: [],
      played: [],
      lastPlayedEnergy: 5,
      remainingSlots: 6,
    });
    const energies = result.tracklist.map((r) => candidatesById.get(r.id)!.energy);
    expect(energies.length).toBeGreaterThan(0);
    expect(energies[energies.length - 1]!).toBeLessThanOrEqual(energies[0]!);
  });

  it("calm replan from energy=5: first pick is below lastPlayedEnergy", async () => {
    const { result, candidatesById } = await replan(deps, {
      intent: { mood: "calm", scene: "study", duration_min: 25 },
      playedIds: [],
      played: [],
      lastPlayedEnergy: 5,
      remainingSlots: 6,
    });
    const energies = result.tracklist.map((r) => candidatesById.get(r.id)!.energy);
    expect(energies[0]!).toBeLessThan(5);
  });

  it("euphoric replan from energy=2: recovers to high energy (max ≥ 4)", async () => {
    const { result, candidatesById } = await replan(deps, {
      intent: { mood: "euphoric", scene: "party", duration_min: 25 },
      playedIds: [],
      played: [],
      lastPlayedEnergy: 2,
      remainingSlots: 6,
    });
    const energies = result.tracklist.map((r) => candidatesById.get(r.id)!.energy);
    expect(Math.max(...energies)).toBeGreaterThanOrEqual(4);
  });

  it("replan excludes already-played track IDs", async () => {
    const { result: initial, candidatesById } = await createPlan(deps, {
      mood: "calm",
      scene: "study",
      duration_min: 25,
    });
    const playedIds = initial.tracklist.slice(0, 3).map((r) => r.id);

    const { result: replanned } = await replan(deps, {
      intent: { mood: "calm", scene: "study", duration_min: 25 },
      playedIds,
      played: playedIds.map((id) => candidatesById.get(id)!),
      lastPlayedEnergy: 1,
      remainingSlots: 5,
    });
    const newIds = replanned.tracklist.map((r) => r.id);
    for (const id of playedIds) expect(newIds, "played id should be excluded").not.toContain(id);
  });
});
