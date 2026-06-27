import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ENERGY_PENALTY_K,
  MOOD_ENERGY_CENTER,
  arcAmplitude,
  createMoodEnergyProfile,
  energyPenalty,
  energyPenaltyFn,
  energyTargetsForMood,
  moodEnergyCenter,
  moodEnergyEnvelope,
  selectMoodEnergySequence,
  type EnergyPenaltyFn,
  type MoodEnergyEnvelope,
} from "../src/mood.js";

test("MOOD_ENERGY_CENTER covers all seven session moods", () => {
  assert.deepEqual(Object.keys(MOOD_ENERGY_CENTER).sort(), [
    "calm",
    "energetic",
    "euphoric",
    "focused",
    "mellow",
    "uplifting",
    "warm",
  ]);
});

test("energy penalty is symmetric around center", () => {
  const center = moodEnergyCenter("focused");
  const below = energyPenalty(center - 1, center);
  const above = energyPenalty(center + 1, center);
  assert.equal(below, above);
  assert.equal(energyPenalty(center, center), 0);
});

test("penalty grows quadratically with distance", () => {
  const center = 3;
  const one = energyPenalty(center + 1, center);
  const two = energyPenalty(center + 2, center);
  assert.equal(two, one * 4);
});

test("larger k steepens the penalty curve (starvation trade-off)", () => {
  const center = MOOD_ENERGY_CENTER.calm;
  const loose = energyPenalty(3, center, 0.5);
  const strict = energyPenalty(3, center, DEFAULT_ENERGY_PENALTY_K);
  assert.ok(strict > loose);
});

test("moodEnergyEnvelope exports center within arc bounds", () => {
  const env: MoodEnergyEnvelope = moodEnergyEnvelope("warm");
  assert.equal(env.center, 2.5);
  assert.ok(env.min <= env.center);
  assert.ok(env.max >= env.center);
});

test("larger k narrows the mood arc envelope", () => {
  const loose = moodEnergyEnvelope("focused", 0.5);
  const strict = moodEnergyEnvelope("focused", 4);
  assert.ok(strict.min > loose.min);
  assert.ok(strict.max < loose.max);
});

test("default mood arc amplitudes match issue #32 bounds", () => {
  assert.deepEqual(arcAmplitude("calm"), { min: 1, max: 1.5 });
  assert.deepEqual(arcAmplitude("euphoric"), { min: 4, max: 5 });
});

test("energy targets stay within mood envelope for all moods and 3-8 slots", () => {
  for (const mood of Object.keys(MOOD_ENERGY_CENTER)) {
    const env = moodEnergyEnvelope(mood);
    for (let slots = 3; slots <= 8; slots++) {
      const targets = energyTargetsForMood(slots, mood, null);
      assert.equal(targets.length, slots);
      assert.ok(targets.every((target) => target >= env.min && target <= env.max), `${mood} ${slots}`);
    }
  }
});

test("energy targets interpolate smoothly for all moods and 3-8 slots", () => {
  for (const mood of Object.keys(MOOD_ENERGY_CENTER)) {
    for (let slots = 3; slots <= 8; slots++) {
      const targets = energyTargetsForMood(slots, mood, null);
      for (let i = 1; i < targets.length; i++) {
        assert.ok(targets[i]! >= targets[i - 1]!, `${mood} ${slots} is monotonic`);
      }
      const deltas = targets.slice(1).map((target, i) => target - targets[i]!);
      const first = deltas[0]!;
      assert.ok(deltas.every((delta) => Math.abs(delta - first) < 1e-9), `${mood} ${slots} is linear`);
    }
  }
});

test("createMoodEnergyProfile concentrates center, penalty, envelope, and targets", () => {
  const profile = createMoodEnergyProfile("calm");
  assert.equal(profile.center, MOOD_ENERGY_CENTER.calm);
  assert.deepEqual(profile.envelope, moodEnergyEnvelope("calm"));
  assert.equal(profile.penalty(3), energyPenalty(3, MOOD_ENERGY_CENTER.calm));
  assert.deepEqual(profile.targets(3, null), energyTargetsForMood(3, "calm", null));
});

test("energyPenaltyFn satisfies EnergyPenaltyFn contract", () => {
  const fn: EnergyPenaltyFn = energyPenaltyFn;
  assert.equal(fn(4, 3), energyPenalty(4, 3));
});

test("calm + 5 slots fills without repeating track ids", () => {
  const catalog = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`,
    energy: i < 4 ? 1 : 2,
  }));
  const picks = selectMoodEnergySequence(catalog, { profile: createMoodEnergyProfile("calm"), slots: 5 });
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((t) => t.id)).size, 5);
  assert.ok(picks.every((t) => t.energy <= 2));
});

test("selectMoodEnergySequence supports excludes and transition penalties", () => {
  const catalog = [
    { id: "skip", energy: 1, family: "a" },
    { id: "a1", energy: 1, family: "a" },
    { id: "b1", energy: 1, family: "b" },
  ];
  const picks = selectMoodEnergySequence(catalog, {
    profile: createMoodEnergyProfile("calm"),
    slots: 2,
    excludeIds: new Set(["skip"]),
    transitionPenalty: (prev, cur) => (prev.family === cur.family ? 10 : 0),
  });
  assert.deepEqual(
    picks.map((p) => p.id),
    ["a1", "b1"],
  );
});

test("starvation: calm borrows higher energy before reusing a track", () => {
  const catalog = [
    { id: "a", energy: 1 },
    { id: "b", energy: 1 },
    { id: "c", energy: 2 },
    { id: "d", energy: 3 },
    { id: "e", energy: 3 },
    { id: "f", energy: 4 },
  ];
  const picks = selectMoodEnergySequence(catalog, { profile: createMoodEnergyProfile("calm", 0.25), slots: 5 });
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((t) => t.id)).size, 5);
});

test("euphoric + 8 slots includes energy 4 and 5", () => {
  const targets = energyTargetsForMood(8, "euphoric", null);
  assert.equal(targets.length, 8);
  assert.ok(targets.includes(4));
  assert.ok(targets.includes(5));

  const catalog = Array.from({ length: 12 }, (_, i) => ({
    id: `t${i}`,
    energy: (i % 5) + 1,
  }));
  const picks = selectMoodEnergySequence(catalog, { profile: createMoodEnergyProfile("euphoric"), slots: 8 });
  const energies = new Set(picks.map((t) => t.energy));
  assert.ok(energies.has(4));
  assert.ok(energies.has(5));
});

test("calm targets stay within mood envelope", () => {
  const { min, max } = arcAmplitude("calm");
  const targets = energyTargetsForMood(5, "calm", null);
  assert.ok(targets.every((e) => e >= Math.floor(min) && e <= Math.ceil(max)));
});
