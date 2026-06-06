import { useEffect, useRef, type RefObject } from 'react';

/**
 * Drives waveform bar animations via DOM refs (zero React re-renders per frame).
 * Bars must have data-wave-bar attribute. Uses transform: scaleY() only.
 */
export function useWaveform(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  analyser?: AnalyserNode | null
) {
  const rafRef = useRef<number>(0);
  const stateRef = useRef({
    targets: new Float32Array(0),
    current: new Float32Array(0),
    envelope: [] as number[],
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bars = Array.from(
      container.querySelectorAll<HTMLElement>('[data-wave-bar]')
    );
    const n = bars.length;
    if (n === 0) return;

    // Reuse arrays if bar count unchanged
    if (stateRef.current.targets.length !== n) {
      stateRef.current.targets = new Float32Array(n).fill(0.05);
      stateRef.current.current = new Float32Array(n).fill(0.05);
      // Gaussian envelope: center bars peak higher, matching natural audio
      stateRef.current.envelope = Array.from({ length: n }, (_, i) => {
        const x = (i / (n - 1)) * 2 - 1;
        return Math.exp(-x * x * 1.2);
      });
    }

    const { targets, current, envelope } = stateRef.current;
    let frameCount = 0;

    const tick = () => {
      frameCount++;

      if (!active) {
        // Settle bars to near-zero while idle
        let anyMoving = false;
        bars.forEach((bar, i) => {
          const diff = 0.04 - current[i];
          current[i] += diff * 0.08;
          if (Math.abs(diff) > 0.002) anyMoving = true;
          bar.style.transform = `scaleY(${current[i].toFixed(3)})`;
        });
        // Keep running to settle, but throttle updates
        if (anyMoving || frameCount < 60) {
          rafRef.current = requestAnimationFrame(tick);
        }
        return;
      }

      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / n);
        bars.forEach((bar, i) => {
          targets[i] = (data[i * step] / 255) * envelope[i];
          current[i] += (targets[i] - current[i]) * 0.3;
          bar.style.transform = `scaleY(${Math.max(0.04, current[i]).toFixed(3)})`;
        });
      } else {
        // Mock: stochastic target updates with smooth interpolation
        if (frameCount % 6 === 0) {
          bars.forEach((_, i) => {
            targets[i] = (0.08 + Math.random() * 0.88) * envelope[i];
          });
        }
        bars.forEach((bar, i) => {
          current[i] += (targets[i] - current[i]) * 0.1;
          bar.style.transform = `scaleY(${Math.max(0.04, current[i]).toFixed(3)})`;
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, analyser, containerRef]);
}
