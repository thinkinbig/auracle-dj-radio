import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMeasurements, parseEbur128Output, parseSilenceOutput, type AudioMeasurements } from "../src/audio-qc.js";

const track = { id: "t01", title: "Example", filePath: "/tmp/example.mp3" };

const clean: AudioMeasurements = {
  durationSec: 120,
  codec: "mp3",
  sampleRate: 44_100,
  channels: 2,
  integratedLufs: -14,
  loudnessRangeLu: 6,
  truePeakDbfs: -1.2,
  silences: [],
};

test("parses the final ffmpeg EBU R128 summary", () => {
  const parsed = parseEbur128Output(`periodic I: -8.0\nSummary:\n\n  Integrated loudness:\n    I:         -13.8 LUFS\n\n  Loudness range:\n    LRA:         5.4 LU\n\n  True peak:\n    Peak:       -1.2 dBFS\n`);
  assert.deepEqual(parsed, { integratedLufs: -13.8, loudnessRangeLu: 5.4, truePeakDbfs: -1.2 });
});

test("reports over-long silence ranges as warning", () => {
  const silences = parseSilenceOutput("silence_start: 62.6856\nsilence_end: 63.7155 | silence_duration: 1.02991\n");
  assert.deepEqual(silences, [{ startSec: 62.6856, endSec: 63.7155, durationSec: 1.02991 }]);
  const result = evaluateMeasurements(track, { ...clean, silences });
  assert.equal(result.status, "warn");
  assert.equal(result.issues[0]?.code, "silence");
  assert.equal(result.issues[0]?.severity, "warning");
});

test("fails on loudness/true_peak errors, warns on duration", () => {
  const result = evaluateMeasurements(track, { ...clean, durationSec: 30, integratedLufs: -9, truePeakDbfs: 0.3 });
  assert.deepEqual(result.issues.map((issue) => issue.code), ["duration", "loudness", "true_peak"]);
  assert.deepEqual(result.issues.map((issue) => issue.severity), ["warning", "error", "error"]);
  assert.equal(result.status, "fail");
});

test("warns when only duration/silence issues present", () => {
  const silences = parseSilenceOutput("silence_start: 89.0\nsilence_end: 90.5 | silence_duration: 1.50000\n");
  const result = evaluateMeasurements(track, { ...clean, durationSec: 30, silences });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.issues.map((i) => i.code), ["duration", "silence"]);
});

test("parses loudnorm first-pass output and builds a deterministic second pass", async () => {
  const { buildSecondPassFilter, parseLoudnormMeasurements } = await import("../src/audio-normalize.js");
  const measurementJson = JSON.stringify({
    input_i: "-9.60",
    input_tp: "0.90",
    input_lra: "4.50",
    input_thresh: "-19.70",
    target_offset: "-0.01",
  });
  const measured = parseLoudnormMeasurements("noise\n" + measurementJson + "\n");
  assert.deepEqual(measured, { inputI: -9.6, inputTp: 0.9, inputLra: 4.5, inputThresh: -19.7, targetOffset: -0.01 });
  assert.equal(
    buildSecondPassFilter(measured, { targetI: -14, targetLra: 11, targetTp: -2 }),
    "I=-14:LRA=11:TP=-2:measured_I=-9.6:measured_LRA=4.5:measured_TP=0.9:measured_thresh=-19.7:offset=-0.01:linear=true:print_format=summary",
  );
});
