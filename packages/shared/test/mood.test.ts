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

test("MOOD_ENERGY_CENTER values match ADR-0001 table", () => {
  assert.equal(MOOD_ENERGY_CENTER.calm, 1);
  assert.equal(MOOD_ENERGY_CENTER.mellow, 2);
  assert.equal(MOOD_ENERGY_CENTER.warm, 2.5);
  assert.equal(MOOD_ENERGY_CENTER.focused, 3);
  assert.equal(MOOD_ENERGY_CENTER.uplifting, 3.5);
  assert.equal(MOOD_ENERGY_CENTER.energetic, 4);
  assert.equal(MOOD_ENERGY_CENTER.euphoric, 5);
});

test("unknown mood falls back to center 3", () => {
  assert.equal(moodEnergyCenter("mystery"), 3);
  assert.equal(moodEnergyEnvelope("mystery").center, 3);
});

test("Gaussian penalty matches k * (energy - center)^2", () => {
  assert.equal(energyPenalty(1, 1, 2), 0);
  assert.equal(energyPenalty(3, 1, 2), 8);
  assert.equal(energyPenalty(5, 1, 2), 32);
  assert.equal(energyPenalty(5, 5, 2), 0);
  assert.equal(energyPenalty(4, 3, 2), 2);
});

test("penalty is zero at center for every mood", () => {
  for (const mood of Object.keys(MOOD_ENERGY_CENTER)) {
    const center = moodEnergyCenter(mood);
    assert.equal(energyPenalty(center, center), 0, mood);
  }
});

test("penalty increases monotonically with distance from center", () => {
  const center = moodEnergyCenter("focused");
  let prev = -1;
  for (let d = 0; d <= 4; d++) {
    const p = energyPenalty(center + d, center);
    assert.ok(p >= prev, `distance ${d}`);
    prev = p;
  }
});

test("calm never selects energy 5 when lower energies are available", () => {
  const catalog = [1, 2, 3, 4, 5].flatMap((energy) =>
    Array.from({ length: 3 }, (_, i) => ({ id: `e${energy}-${i}`, energy })),
  );
  for (const slots of [3, 5, 8]) {
    const picks = selectMoodEnergySequence(catalog, {
      profile: createMoodEnergyProfile("calm"),
      slots,
    });
    assert.ok(picks.every((t) => t.energy !== 5), `slots=${slots}`);
  }
});

test("calm session max energy stays at or below 3", () => {
  const catalog = Array.from({ length: 20 }, (_, i) => ({
    id: `t${i}`,
    energy: (i % 5) + 1,
  }));
  for (const slots of [3, 5, 8]) {
    const picks = selectMoodEnergySequence(catalog, {
      profile: createMoodEnergyProfile("calm"),
      slots,
    });
    const max = Math.max(...picks.map((t) => t.energy));
    assert.ok(max <= 3, `slots=${slots} max=${max}`);
  }
});

test("euphoric session peak is at least energy 4", () => {
  const catalog = Array.from({ length: 20 }, (_, i) => ({
    id: `t${i}`,
    energy: (i % 5) + 1,
  }));
  for (const slots of [3, 5, 8]) {
    const picks = selectMoodEnergySequence(catalog, {
      profile: createMoodEnergyProfile("euphoric"),
      slots,
    });
    const max = Math.max(...picks.map((t) => t.energy));
    assert.ok(max >= 4, `slots=${slots} max=${max}`);
  }
});

test("euphoric targets always include energies 4 and 5 for 3+ slots", () => {
  for (let slots = 3; slots <= 8; slots++) {
    const targets = energyTargetsForMood(slots, "euphoric", null);
    assert.ok(targets.some((t) => t >= 4), `slots=${slots}`);
    assert.ok(targets.some((t) => t >= 5), `slots=${slots}`);
  }
});

test("starvation: calm borrows energy 3 before energy 5", () => {
  const catalog = [
    { id: "a", energy: 1 },
    { id: "b", energy: 1 },
    { id: "c", energy: 3 },
    { id: "e5", energy: 5 },
  ];
  const picks = selectMoodEnergySequence(catalog, {
    profile: createMoodEnergyProfile("calm"),
    slots: 3,
  });
  assert.equal(picks.length, 3);
  assert.equal(picks[2]!.energy, 3);
  assert.ok(picks.every((t) => t.energy !== 5));
});

test("starvation: euphoric fills from high-energy pool without reusing tracks", () => {
  const catalog = [
    { id: "a", energy: 4 },
    { id: "b", energy: 4 },
    { id: "c", energy: 5 },
    { id: "d", energy: 5 },
    { id: "low", energy: 1 },
  ];
  const picks = selectMoodEnergySequence(catalog, {
    profile: createMoodEnergyProfile("euphoric"),
    slots: 4,
  });
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks.map((t) => t.id)).size, 4);
  assert.ok(picks.every((t) => t.energy >= 4));
});

test("replan glide lowers targets from high lastPlayedEnergy toward calm floor", () => {
  const targets = energyTargetsForMood(4, "calm", 5);
  const env = moodEnergyEnvelope("calm");
  assert.equal(targets[0], 4);
  assert.ok(targets.at(-1)! >= env.min);
  assert.ok(targets.at(-1)! <= env.max);
  for (let i = 1; i < targets.length; i++) {
    assert.ok(targets[i]! <= targets[i - 1]!, "replan glides down");
  }
});

test("single-slot target is envelope midpoint", () => {
  const env = moodEnergyEnvelope("warm");
  const [target] = energyTargetsForMood(1, "warm", null);
  assert.equal(target, (env.min + env.max) / 2);
});
