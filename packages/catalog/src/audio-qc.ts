import { existsSync } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export interface QcThresholds {
  minDurationSec: number;
  maxDurationSec: number;
  targetLufs: number;
  lufsTolerance: number;
  maxTruePeakDbfs: number;
  maxSilenceSec: number;
}

/** Conservative delivery limits for generated catalogue tracks. */
export const DEFAULT_QC_THRESHOLDS: Readonly<QcThresholds> = {
  minDurationSec: 45,
  maxDurationSec: 210,
  targetLufs: -14,
  lufsTolerance: 2,
  maxTruePeakDbfs: 0,
  maxSilenceSec: 1,
};

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

export interface CatalogQcTrack {
  id: string;
  title: string;
  filePath: string;
}

export interface SilenceRange {
  startSec: number;
  endSec: number | null;
  durationSec: number | null;
}

export interface AudioMeasurements {
  durationSec: number;
  codec: string;
  sampleRate: number;
  channels: number;
  integratedLufs: number;
  loudnessRangeLu: number;
  truePeakDbfs: number;
  silences: SilenceRange[];
}

export interface QcIssue {
  code: "missing_file" | "analysis_error" | "duration" | "loudness" | "true_peak" | "silence";
  message: string;
  severity: "error" | "warning";
}

export interface TrackQcResult {
  track: CatalogQcTrack;
  status: "pass" | "fail" | "warn";
  measurements?: AudioMeasurements;
  issues: QcIssue[];
}

export interface CatalogQcReport {
  schemaVersion: 1;
  generatedAt: string;
  semanticMoodChecked: false;
  thresholds: QcThresholds;
  summary: { total: number; passed: number; failed: number; warned: number };
  tracks: TrackQcResult[];
}

interface FfprobeJson {
  streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
  format?: { duration?: string };
}

const defaultRunner: CommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFile(command, [...args], { maxBuffer: 8 * 1024 * 1024 });
  return { stdout, stderr };
};

export function parseFfprobeOutput(text: string): Pick<AudioMeasurements, "durationSec" | "codec" | "sampleRate" | "channels"> {
  const parsed = JSON.parse(text) as FfprobeJson;
  const stream = parsed.streams?.[0];
  const durationSec = Number(parsed.format?.duration);
  const sampleRate = Number(stream?.sample_rate);
  if (!stream?.codec_name || !Number.isFinite(durationSec) || !Number.isFinite(sampleRate) || !stream.channels) {
    throw new Error("ffprobe returned incomplete audio metadata");
  }
  return { durationSec, codec: stream.codec_name, sampleRate, channels: stream.channels };
}

/** Extract the final EBU R128 summary; ffmpeg also emits periodic measurements. */
export function parseEbur128Output(text: string): Pick<AudioMeasurements, "integratedLufs" | "loudnessRangeLu" | "truePeakDbfs"> {
  const summary = text.slice(text.lastIndexOf("Summary:"));
  const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?)/.exec(summary)?.[1];
  const range = /Loudness range:\s*\n\s*LRA:\s*(-?\d+(?:\.\d+)?)/.exec(summary)?.[1];
  const peak = /True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?)/.exec(summary)?.[1];
  const integratedLufs = Number(integrated);
  const loudnessRangeLu = Number(range);
  const truePeakDbfs = Number(peak);
  if (![integratedLufs, loudnessRangeLu, truePeakDbfs].every(Number.isFinite)) {
    throw new Error("ffmpeg ebur128 summary is missing required measurements");
  }
  return { integratedLufs, loudnessRangeLu, truePeakDbfs };
}

export function parseSilenceOutput(text: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  let startSec: number | undefined;
  for (const line of text.split("\n")) {
    const start = /silence_start:\s*([\d.]+)/.exec(line)?.[1];
    if (start) {
      startSec = Number(start);
      continue;
    }
    const end = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/.exec(line);
    if (end) {
      ranges.push({ startSec: startSec ?? Number(end[1]) - Number(end[2]), endSec: Number(end[1]), durationSec: Number(end[2]) });
      startSec = undefined;
    }
  }
  if (startSec !== undefined) ranges.push({ startSec, endSec: null, durationSec: null });
  return ranges;
}

export function evaluateMeasurements(track: CatalogQcTrack, measurements: AudioMeasurements, thresholds: QcThresholds = DEFAULT_QC_THRESHOLDS): TrackQcResult {
  const issues: QcIssue[] = [];
  if (measurements.durationSec < thresholds.minDurationSec || measurements.durationSec > thresholds.maxDurationSec) {
    issues.push({ code: "duration", severity: "warning", message: `duration ${measurements.durationSec.toFixed(1)}s is outside ${thresholds.minDurationSec}-${thresholds.maxDurationSec}s` });
  }
  if (Math.abs(measurements.integratedLufs - thresholds.targetLufs) > thresholds.lufsTolerance) {
    issues.push({ code: "loudness", severity: "error", message: `integrated loudness ${measurements.integratedLufs.toFixed(1)} LUFS is outside ${thresholds.targetLufs}±${thresholds.lufsTolerance} LUFS` });
  }
  if (measurements.truePeakDbfs > thresholds.maxTruePeakDbfs) {
    issues.push({ code: "true_peak", severity: "error", message: `true peak ${measurements.truePeakDbfs.toFixed(1)} dBFS exceeds ${thresholds.maxTruePeakDbfs} dBFS` });
  }
  for (const silence of measurements.silences) {
    if (silence.durationSec === null || silence.durationSec > thresholds.maxSilenceSec) {
      const detail = silence.durationSec === null ? `from ${silence.startSec.toFixed(1)}s to end of file` : `${silence.durationSec.toFixed(2)}s at ${silence.startSec.toFixed(1)}s`;
      issues.push({ code: "silence", severity: "warning", message: `silence ${detail} exceeds ${thresholds.maxSilenceSec}s` });
    }
  }
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  let status: TrackQcResult["status"] = "pass";
  if (errors.length > 0) status = "fail";
  else if (warnings.length > 0) status = "warn";
  return { track, status, measurements, issues };
}

async function measureAudio(path: string, run: CommandRunner): Promise<AudioMeasurements> {
  const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", path]);
  const loudness = await run("ffmpeg", ["-nostdin", "-hide_banner", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
  const silence = await run("ffmpeg", ["-nostdin", "-hide_banner", "-i", path, "-af", "silencedetect=noise=-50dB:d=1", "-f", "null", "-"]);
  return { ...parseFfprobeOutput(probe.stdout), ...parseEbur128Output(loudness.stderr), silences: parseSilenceOutput(silence.stderr) };
}

export async function runCatalogQc(tracks: readonly CatalogQcTrack[], options: { thresholds?: QcThresholds; run?: CommandRunner; now?: () => Date } = {}): Promise<CatalogQcReport> {
  const thresholds = options.thresholds ?? DEFAULT_QC_THRESHOLDS;
  const run = options.run ?? defaultRunner;
  const results: TrackQcResult[] = [];
  for (const track of tracks) {
    if (!existsSync(track.filePath)) {
      results.push({ track, status: "fail", issues: [{ code: "missing_file", severity: "error", message: `audio file does not exist: ${track.filePath}` }] });
      continue;
    }
    try {
      results.push(evaluateMeasurements(track, await measureAudio(track.filePath, run), thresholds));
    } catch (error) {
      results.push({ track, status: "fail", issues: [{ code: "analysis_error", severity: "error", message: error instanceof Error ? error.message : String(error) }] });
    }
  }
  const failed = results.filter((result) => result.status === "fail").length;
  const warned = results.filter((result) => result.status === "warn").length;
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    semanticMoodChecked: false,
    thresholds: { ...thresholds },
    summary: { total: results.length, passed: results.length - failed - warned, failed, warned },
    tracks: results,
  };
}
