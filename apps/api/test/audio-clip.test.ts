import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_AUDIO_EMBED_SEC, readAudioEmbedClip, sliceMp3Prefix } from "../src/flow/audio-clip.js";

const apiRoot = resolve(fileURLToPath(import.meta.url), "../..");
const t01 = resolve(apiRoot, "data/tracks/t01.mp3");
const t02 = resolve(apiRoot, "data/tracks/t02.mp3");

function mp3DurationSec(buf: Buffer): number {
  let offset = 0;
  if (buf.toString("ascii", 0, 3) === "ID3") {
    const size =
      ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
    offset = 10 + size;
  }
  let sec = 0;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff || (buf[offset + 1]! & 0xe0) !== 0xe0) {
      offset++;
      continue;
    }
    const b1 = buf[offset + 1]!;
    const b2 = buf[offset + 2]!;
    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    if (layerBits !== 0x01) {
      offset++;
      continue;
    }
    const bitrateIdx = (b2 >> 4) & 0x0f;
    const sampleRateIdx = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    const mpeg1 = versionBits === 0x03;
    const bitrates = mpeg1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    const sampleRates = mpeg1
      ? [44100, 48000, 32000, 0]
      : versionBits === 0x02
        ? [22050, 24000, 16000, 0]
        : [11025, 12000, 8000, 0];
    const br = bitrates[bitrateIdx]! * 1000;
    const sr = sampleRates[sampleRateIdx]!;
    if (!br || !sr) {
      offset++;
      continue;
    }
    const frameSize = (mpeg1 ? Math.floor((144 * br) / sr) : Math.floor((72 * br) / sr)) + padding;
    sec += (mpeg1 ? 1152 : 576) / sr;
    offset += frameSize;
  }
  return sec;
}

describe("sliceMp3Prefix", () => {
  it("clips long tracks to ~180s without ffmpeg", () => {
    const file = readFileSync(t01);
    const clip = sliceMp3Prefix(file, 180);
    const dur = mp3DurationSec(clip);
    expect(dur).toBeGreaterThan(179);
    expect(dur).toBeLessThanOrEqual(180.1);
    expect(clip.length).toBeLessThan(file.length);
  });

  it("keeps full audio when track is under the limit", () => {
    const file = readFileSync(t02);
    const clip = sliceMp3Prefix(file, 180);
    expect(mp3DurationSec(clip)).toBeLessThan(180);
    expect(Math.abs(mp3DurationSec(clip) - mp3DurationSec(file))).toBeLessThan(0.5);
  });

  it("readAudioEmbedClip reads from disk", async () => {
    const clip = await readAudioEmbedClip(t01);
    expect(clip.length).toBeGreaterThan(0);
    expect(mp3DurationSec(clip)).toBeLessThanOrEqual(MAX_AUDIO_EMBED_SEC + 0.1);
  });
});
