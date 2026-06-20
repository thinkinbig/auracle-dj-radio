// WebAudio glue for the Live voice channel: route the DJ's WebRTC Opus stream and
// the music element through a single master bus with an AnalyserNode for
// StageWaveform. The mic is a WebRTC track now (no PCM capture here); the mic
// analyser taps the local stream for the waveform only.

const FADE_SEC = 0.4; // music duck / restore — smooth talk-over weave, not a hard jump
const DJ_FADE_IN_SEC = 0.15; // DJ voice eases in at turn start
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
  /** Route the DJ's remote WebRTC stream through the duckable DJ gain. */
  attachDjStream(stream: MediaStream): void;
  setMusicVolume(v: number, seconds?: number): void;
  setDjVolume(v: number, seconds?: number): void;
  /** Begin/restore a DJ turn: fade the voice back in. */
  resumeDj(): void;
  /** Cut the DJ voice-over locally: fade the DJ gain to silence (stream keeps flowing). */
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
  let djSource: MediaStreamAudioSourceNode | null = null;
  // Chrome quirk: a remote WebRTC stream routed ONLY through createMediaStreamSource
  // feeds the AnalyserNode (so the waveform animates) but is SILENT at the
  // destination. Sinking it into a muted media element unblocks the pipeline; the
  // muted element makes no sound itself, so Web Audio (djGain) stays the single
  // audible, duckable path. createMediaElementSource (music) is unaffected.
  let djSink: HTMLAudioElement | null = null;

  return {
    attachMusicElement(el) {
      if (musicSource) return;
      musicSource = ctx.createMediaElementSource(el);
      musicSource.connect(musicGain);
    },
    attachDjStream(stream) {
      if (djSource) djSource.disconnect();
      djSource = ctx.createMediaStreamSource(stream);
      djSource.connect(djGain);
      if (!djSink) {
        djSink = new Audio();
        djSink.muted = true;
      }
      djSink.srcObject = stream;
      void djSink.play().catch(() => {});
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
      this.setDjVolume(1, DJ_FADE_IN_SEC);
    },
    skipDj() {
      ramp(djGain.gain, 0, DJ_CUT_SEC, ctx.currentTime);
    },
    getAnalyser() {
      return analyser;
    },
    resume() {
      return ctx.resume();
    },
    close() {
      djSource?.disconnect();
      if (djSink) {
        djSink.pause();
        djSink.srcObject = null;
        djSink = null;
      }
      void ctx.close();
    },
  };
}

export interface MicAnalyser {
  /** Mic-input spectrum, for driving the waveform while the listener holds the floor. */
  getAnalyser(): AnalyserNode;
  stop(): void;
}

/**
 * Tap a mic MediaStream's spectrum for the waveform (read-only). The stream is
 * owned by the WebRTC connection — stop() only tears down the analyser nodes, it
 * does NOT stop the tracks.
 */
export function createMicAnalyser(stream: MediaStream): MicAnalyser {
  const ctx = new AudioContext();
  void ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  return {
    getAnalyser() {
      return analyser;
    },
    stop() {
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
    },
  };
}
