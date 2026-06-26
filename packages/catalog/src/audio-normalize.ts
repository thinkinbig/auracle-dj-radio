import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { CommandResult, CommandRunner } from "./audio-qc.js";

const execFile = promisify(execFileCallback);

export interface LoudnormMeasurements {
  inputI: number;
  inputLra: number;
  inputTp: number;
  inputThresh: number;
  targetOffset: number;
}

export interface NormalizeOptions {
  targetI?: number;
  targetLra?: number;
  /** Use -2 dBTP by default to leave headroom for MP3 re-encoding. */
  targetTp?: number;
  bitrate?: string;
  /** Catalog delivery sample rate; all current source assets are 44.1 kHz. */
  sampleRate?: number;
  run?: CommandRunner;
}

export interface NormalizeResult {
  inputPath: string;
  outputPath: string;
  measurements: LoudnormMeasurements;
}

const defaultRunner: CommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFile(command, [...args], { maxBuffer: 8 * 1024 * 1024 });
  return { stdout, stderr };
};

function numeric(value: unknown, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`loudnorm measurement ${key} is missing or invalid`);
  return parsed;
}

/** Parse the JSON object printed by `loudnorm=...:print_format=json`. */
export function parseLoudnormMeasurements(text: string): LoudnormMeasurements {
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("ffmpeg loudnorm output does not contain JSON measurements");
  const stats = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  return {
    inputI: numeric(stats.input_i, "input_i"),
    inputLra: numeric(stats.input_lra, "input_lra"),
    inputTp: numeric(stats.input_tp, "input_tp"),
    inputThresh: numeric(stats.input_thresh, "input_thresh"),
    targetOffset: numeric(stats.target_offset, "target_offset"),
  };
}

export function buildSecondPassFilter(measured: LoudnormMeasurements, options: Required<Pick<NormalizeOptions, "targetI" | "targetLra" | "targetTp">>): string {
  return [
    `I=${options.targetI}`,
    `LRA=${options.targetLra}`,
    `TP=${options.targetTp}`,
    `measured_I=${measured.inputI}`,
    `measured_LRA=${measured.inputLra}`,
    `measured_TP=${measured.inputTp}`,
    `measured_thresh=${measured.inputThresh}`,
    `offset=${measured.targetOffset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
}

export async function normalizeAudio(inputPath: string, outputPath: string, options: NormalizeOptions = {}): Promise<NormalizeResult> {
  const targetI = options.targetI ?? -14;
  const targetLra = options.targetLra ?? 11;
  const targetTp = options.targetTp ?? -3;
  const bitrate = options.bitrate ?? "256k";
  const sampleRate = options.sampleRate ?? 44_100;
  const run = options.run ?? defaultRunner;
  const firstPass = await run("ffmpeg", [
    "-nostdin", "-hide_banner", "-i", inputPath,
    "-af", `loudnorm=I=${targetI}:LRA=${targetLra}:TP=${targetTp}:print_format=json`,
    "-f", "null", "-",
  ]);
  const measurements = parseLoudnormMeasurements(firstPass.stderr);
  await run("ffmpeg", [
    "-nostdin", "-hide_banner", "-y", "-i", inputPath,
    "-af", `loudnorm=${buildSecondPassFilter(measurements, { targetI, targetLra, targetTp })}`,
    "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", String(sampleRate), outputPath,
  ]);
  return { inputPath, outputPath, measurements };
}
