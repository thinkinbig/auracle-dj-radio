import { useEffect, useRef, type RefObject } from 'react';

const IDLE_FLOOR = 0.04;
const ATTACK_RATE = 0.52;
const RELEASE_RATE = 0.22;
const BASE_SCROLL = 0.18;
const ENERGY_SCROLL = 0.55;

export type WaveformMode = 'live' | 'playing' | 'idle';

function sampleSpectrum(data: Uint8Array, pos: number): number {
  const max = data.length - 1;
  const clamped = Math.max(0, Math.min(max, pos));
  const idx = Math.floor(clamped);
  const frac = clamped - idx;
  const v0 = data[idx];
  const v1 = data[Math.min(idx + 1, max)];
  return (v0 + (v1 - v0) * frac) / 255;
}

function applyBar(bar: HTMLElement, scale: number): void {
  const clamped = Math.max(IDLE_FLOOR, Math.min(1, scale));
  bar.style.transform = `scaleY(${clamped.toFixed(3)})`;
  bar.style.setProperty('--bar-energy', clamped.toFixed(3));
}

/**
 * Drives waveform bar animations via DOM refs (zero React re-renders per frame).
 * Bars must have data-wave-bar attribute. Uses transform: scaleY() only.
 * Active mode scrolls the frequency mapping so peaks drift left like a DJ scope.
 * Per-bar --bar-energy drives gradient brightness (live green / playing gray-white).
 */
export function useWaveform(
  containerRef: RefObject<HTMLElement | null>,
  mode: WaveformMode,
  barCount: number,
  analyser?: AnalyserNode | null
) {
  const rafRef = useRef<number>(0);
  const stateRef = useRef({
    targets: new Float32Array(0),
    current: new Float32Array(0),
    scrollPhase: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bars = Array.from(
      container.querySelectorAll<HTMLElement>('[data-wave-bar]')
    );
    const n = bars.length;
    if (n === 0) return;

    if (stateRef.current.targets.length !== n) {
      stateRef.current.targets = new Float32Array(n).fill(IDLE_FLOOR);
      stateRef.current.current = new Float32Array(n).fill(IDLE_FLOOR);
      stateRef.current.scrollPhase = 0;
    }

    const { targets, current } = stateRef.current;
    const active = mode !== 'idle';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameCount = 0;

    const tick = () => {
      frameCount++;

      if (!active) {
        let anyMoving = false;
        bars.forEach((bar, i) => {
          const diff = IDLE_FLOOR - current[i];
          current[i] += diff * 0.08;
          if (Math.abs(diff) > 0.002) anyMoving = true;
          applyBar(bar, current[i]);
        });
        if (anyMoving || frameCount < 60) {
          rafRef.current = requestAnimationFrame(tick);
        }
        return;
      }

      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);

        let energy = 0;
        for (let i = 0; i < data.length; i++) energy += data[i];
        const energyNorm = energy / (data.length * 255);
        if (!reduceMotion) {
          stateRef.current.scrollPhase += BASE_SCROLL + energyNorm * ENERGY_SCROLL;
        }

        const span = Math.max(8, data.length - 1);
        const step = span / Math.max(1, n - 1);
        const scroll = reduceMotion ? 0 : stateRef.current.scrollPhase;

        bars.forEach((bar, i) => {
          const pos = ((i * step + scroll) % span + span) % span;
          targets[i] = sampleSpectrum(data, pos);

          const delta = targets[i] - current[i];
          const rate = delta > 0 ? ATTACK_RATE : RELEASE_RATE;
          current[i] += delta * rate;
          applyBar(bar, current[i]);
        });
      } else {
        bars.forEach((bar, i) => {
          const diff = IDLE_FLOOR - current[i];
          current[i] += diff * 0.08;
          applyBar(bar, current[i]);
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, analyser, barCount, containerRef]);
}
