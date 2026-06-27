import { readFile } from "node:fs/promises";

/** Gemini Embedding 2 audio limit — we only embed the intro for retrieval. */
export const MAX_AUDIO_EMBED_SEC = 180;

const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, 0];
const MPEG25_SAMPLE_RATES = [11025, 12000, 8000, 0];

/**
 * First N seconds of an mp3 as bytes (frame-aligned, no re-encode).
 * Pure Node — no ffmpeg. Used only at catalog seed time.
 */
export async function readAudioEmbedClip(filePath: string, maxSec = MAX_AUDIO_EMBED_SEC): Promise<Buffer> {
  const file = await readFile(filePath);
  return sliceMp3Prefix(file, maxSec);
}

/** Exported for unit tests. */
export function sliceMp3Prefix(file: Buffer, maxSec: number): Buffer {
  const start = skipId3v2(file);
  if (measureDuration(file, start) <= maxSec) {
    return file.subarray(start);
  }

  let offset = start;
  let durationSec = 0;

  while (offset + 4 < file.length && durationSec < maxSec) {
    if (file[offset] !== 0xff || (file[offset + 1]! & 0xe0) !== 0xe0) {
      offset++;
      continue;
    }

    const frame = parseMp3Frame(file, offset);
    if (!frame) {
      offset++;
      continue;
    }

    if (durationSec + frame.durationSec > maxSec && durationSec > 0) break;

    offset += frame.size;
    durationSec += frame.durationSec;
  }

  if (offset <= start) {
    throw new Error("No MP3 frames found in audio file");
  }
  return file.subarray(start, offset);
}

function measureDuration(file: Buffer, start: number): number {
  let offset = start;
  let durationSec = 0;
  while (offset + 4 < file.length) {
    if (file[offset] !== 0xff || (file[offset + 1]! & 0xe0) !== 0xe0) {
      offset++;
      continue;
    }
    const frame = parseMp3Frame(file, offset);
    if (!frame) {
      offset++;
      continue;
    }
    offset += frame.size;
    durationSec += frame.durationSec;
  }
  return durationSec;
}

function skipId3v2(file: Buffer): number {
  if (file.length < 10 || file.toString("ascii", 0, 3) !== "ID3") return 0;
  const size =
    ((file[6]! & 0x7f) << 21) | ((file[7]! & 0x7f) << 14) | ((file[8]! & 0x7f) << 7) | (file[9]! & 0x7f);
  return 10 + size;
}

interface Mp3Frame {
  size: number;
  durationSec: number;
}

function parseMp3Frame(file: Buffer, offset: number): Mp3Frame | null {
  if (offset + 4 > file.length) return null;

  const b1 = file[offset + 1]!;
  const b2 = file[offset + 2]!;
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;

  if (layerBits !== 0x01 || bitrateIdx === 0 || bitrateIdx === 0x0f || sampleRateIdx === 0x03) {
    return null;
  }

  let bitrates: number[];
  let sampleRates: number[];
  let samplesPerFrame: number;

  if (versionBits === 0x03) {
    bitrates = MPEG1_L3_BITRATES;
    sampleRates = MPEG1_SAMPLE_RATES;
    samplesPerFrame = 1152;
  } else if (versionBits === 0x02) {
    bitrates = MPEG2_L3_BITRATES;
    sampleRates = MPEG2_SAMPLE_RATES;
    samplesPerFrame = 576;
  } else if (versionBits === 0x00) {
    bitrates = MPEG2_L3_BITRATES;
    sampleRates = MPEG25_SAMPLE_RATES;
    samplesPerFrame = 576;
  } else {
    return null;
  }

  const bitrateKbps = bitrates[bitrateIdx];
  const sampleRate = sampleRates[sampleRateIdx];
  if (!bitrateKbps || !sampleRate) return null;

  const bitrate = bitrateKbps * 1000;
  const size =
    versionBits === 0x03
      ? Math.floor((144 * bitrate) / sampleRate) + padding
      : Math.floor((72 * bitrate) / sampleRate) + padding;

  if (size < 4 || offset + size > file.length) return null;

  return { size, durationSec: samplesPerFrame / sampleRate };
}
