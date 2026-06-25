import { useState } from 'react';
import type { SessionIntent } from '@auracle/shared';
import { DOING_OPTIONS, FEEL_OPTIONS } from '@/data/intentOptions';
import { cn } from '@/shared/lib/cn';
import { IconPlay } from '@/shared/ui/Icons';
import styles from './IntentOnboarding.module.css';

interface IntentOnboardingProps {
  onStart: (intent: SessionIntent) => void;
  disabled?: boolean;
}

export function IntentOnboarding({ onStart, disabled }: IntentOnboardingProps) {
  const [feelChip, setFeelChip] = useState<string | null>(null);
  const [feelCustom, setFeelCustom] = useState('');
  const [doingChip, setDoingChip] = useState<string | null>(null);
  const [doingCustom, setDoingCustom] = useState('');

  const mood = feelCustom.trim() || feelChip || '';
  const scene = doingCustom.trim() || doingChip || '';
  const canStart = Boolean(mood && scene) && !disabled;

  const onFeelCustomChange = (value: string) => {
    setFeelCustom(value);
    if (value.trim()) setFeelChip(null);
  };

  const onDoingCustomChange = (value: string) => {
    setDoingCustom(value);
    if (value.trim()) setDoingChip(null);
  };

  const onFeelChip = (value: string) => {
    setFeelChip(value);
    setFeelCustom('');
  };

  const onDoingChip = (value: string) => {
    setDoingChip(value);
    setDoingCustom('');
  };

  return (
    <div className={styles.root}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>How do you feel?</legend>
        <div className={styles.chips} role="list">
          {FEEL_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="listitem"
              className={cn(styles.chip, feelChip === o.value && !feelCustom.trim() && styles.chipActive)}
              onClick={() => onFeelChip(o.value)}
              aria-pressed={feelChip === o.value && !feelCustom.trim()}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          className={styles.input}
          type="text"
          placeholder="Or describe in your own words…"
          value={feelCustom}
          onChange={(e) => onFeelCustomChange(e.target.value)}
          aria-label="How you feel, in your own words"
        />
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>What are you doing?</legend>
        <div className={styles.chips} role="list">
          {DOING_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="listitem"
              className={cn(styles.chip, doingChip === o.value && !doingCustom.trim() && styles.chipActive)}
              onClick={() => onDoingChip(o.value)}
              aria-pressed={doingChip === o.value && !doingCustom.trim()}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          className={styles.input}
          type="text"
          placeholder="Or describe your activity…"
          value={doingCustom}
          onChange={(e) => onDoingCustomChange(e.target.value)}
          aria-label="What you are doing, in your own words"
        />
      </fieldset>

      <button
        type="button"
        className={styles.startBtn}
        disabled={!canStart}
        onClick={() => onStart({ mood, scene, duration_min: 25 })}
        aria-label="Start listening"
      >
        <span className={styles.startIcon} aria-hidden>
          <IconPlay size={22} />
        </span>
        Start listening
      </button>
    </div>
  );
}
