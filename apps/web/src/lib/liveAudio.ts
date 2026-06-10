// WebAudio glue for the Live voice channel: play the DJ's 24kHz PCM stream and
// capture the mic as 16kHz PCM for Gemini Live (doc/auracle_api_protocol.md §Live).
// Playback routes through a single master bus with AnalyserNode for StageWaveform.

const DJ_SAMPLE_RATE = 24000; // relay sends s16le mono 24kHz
const MIC_SAMPLE_RATE = 16000; // INPUT_MIME audio/pcm;rate=16000
const MIC_FRAME = 4096;

const FADE_SEC = 0.4; // music duck / restore — smooth talk-over weave, not a hard jump
const DJ_FADE_IN_SEC = 0.15; // DJ voice eases in at turn start
const DJ_FADE_OUT_SEC = 0.3; // DJ voice eases out at turn end
const DJ_CUT_SEC = 0.12; // quick fade when the user skips the voice-over

/** Smoothly ramp an AudioParam to `target` over `seconds`, anchored at its current value. */
function ramp(param: AudioParam, target: number, seconds: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

export interface AudioBus {
  /** Wire an <audio> element once; volume is controlled via setMusicVolume. */
  attachMusicElement(el: HTMLAudioElement): void;
  /** Schedule one DJ PCM frame (Int16 little-endian) back-to-back after the last. */
  playDj(pcm: ArrayBuffer): void;
  setMusicVolume(v: number, seconds?: number): void;
  setDjVolume(v: number, seconds?: number): void;
  /** Begin a DJ turn: clear any skip suppression and fade the voice in. */
  resumeDj(): void;
  /** Cut the current DJ voice-over: fade out, drop scheduled frames, suppress the rest of the turn. */
  skipDj(): void;
  getAnalyser(): AnalyserNode;
  resume(): Promise<void>;
  close(): void;
}

/** Single AudioContext: music + DJ → masterGain → analyser → destination. */
export function createAudioBus(): AudioBus {
  const ctx = new AudioContext();
  const musicGain = ctx.createGain();
  const djGain = ctx.createGain();
  const masterGain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.55;

  musicGain.connect(masterGain);
  djGain.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  let musicSource: MediaElementAudioSourceNode | null = null;
  let djCursor = 0;
  let djSuppressed = false;
  const activeDjSources = new Set<AudioBufferSourceNode>();

  function stopActiveDjSources(): void {
    for (const src of activeDjSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    activeDjSources.clear();
    djCursor = ctx.currentTime;
  }

  return {
    attachMusicElement(el) {
      if (musicSource) return;
      musicSource = ctx.createMediaElementSource(el);
      musicSource.connect(musicGain);
    },
    playDj(pcm) {
      if (djSuppressed) return;
      const int16 = new Int16Array(pcm);
      if (int16.length === 0) return;
      const buf = ctx.createBuffer(1, int16.length, DJ_SAMPLE_RATE);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(djGain);
      const start = Math.max(ctx.currentTime, djCursor);
      src.start(start);
      djCursor = start + buf.duration;
      activeDjSources.add(src);
      src.onended = () => activeDjSources.delete(src);
    },
    setMusicVolume(v, seconds = FADE_SEC) {
      const now = ctx.currentTime;
      if (seconds > 0) ramp(musicGain.gain, v, seconds, now);
      else musicGain.gain.value = v;
    },
    setDjVolume(v, seconds = DJ_FADE_IN_SEC) {
      const now = ctx.currentTime;
      if (seconds > 0) ramp(djGain.gain, v, seconds, now);
      else djGain.gain.value = v;
    },
    resumeDj() {
      djSuppressed = false;
      djCursor = ctx.currentTime;
      this.setDjVolume(1, DJ_FADE_IN_SEC);
    },
    skipDj() {
      djSuppressed = true;
      stopActiveDjSources();
      ramp(djGain.gain, 0, DJ_CUT_SEC, ctx.currentTime);
    },
    getAnalyser() {
      return analyser;
    },
    resume() {
      return ctx.resume();
    },
    close() {
      stopActiveDjSources();
      void ctx.close();
    },
  };
}

export interface MicCapture {
  /** Mic-input spectrum, for driving the waveform while the listener holds the floor. */
  getAnalyser(): AnalyserNode;
  stop(): void;
}

/** Stream the mic to `onPcm` as 16kHz Int16 PCM frames. Prompts for permission. */
export async function startMicCapture(onPcm: (pcm: ArrayBuffer) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
  void ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(MIC_FRAME, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  // Tap the raw mic for the waveform (matches the master bus analyser so the bars
  // look consistent when the source switches to the mic). A read-only sink — it
  // needs no downstream connection.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    onPcm(out.buffer);
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  return {
    getAnalyser() {
      return analyser;
    },
    stop() {
      processor.disconnect();
      source.disconnect();
      analyser.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

// Re-export fade constants for tests.
export const _test = { FADE_SEC, DJ_FADE_IN_SEC, DJ_CUT_SEC, DJ_FADE_OUT_SEC };
