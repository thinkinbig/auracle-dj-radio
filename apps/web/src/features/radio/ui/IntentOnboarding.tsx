import { useState, type KeyboardEvent } from 'react';
import type { SessionIntent } from '@auracle/shared';
import { DOING_OPTIONS, FEEL_OPTIONS } from '@/data/intentOptions';
import { cn } from '@/shared/lib/cn';
import styles from './IntentOnboarding.module.css';

interface IntentOnboardingProps {
  onStart: (intent: SessionIntent) => void;
  disabled?: boolean;
  tasteSummary?: string;
  memorySummary?: string;
}

const MOOD_ICON_BY_VALUE: Record<string, string> = {
  calm: 'orb',
  mellow: 'cloud',
  warm: 'sun',
  focused: 'target',
  uplifting: 'spark',
  energetic: 'waves',
  euphoric: 'pulse',
};

const STEPS = [
  { id: 1, title: 'How do you feel today?', caption: 'Choose the mood that best captures you right now.' },
  { id: 2, title: 'What are you doing?', caption: 'Your activity shapes the flow, pace, and energy.' },
  { id: 3, title: 'Anything else?', caption: 'Leave Auracle a small cue before it builds the station.' },
] as const;

export function IntentOnboarding({
  onStart,
  disabled,
  tasteSummary = 'your Taste DNA',
  memorySummary = 'your listening memory',
}: IntentOnboardingProps) {
  const [step, setStep] = useState(1);
  const [feelChip, setFeelChip] = useState<string | null>(null);
  const [feelCustom, setFeelCustom] = useState('');
  const [doingChip, setDoingChip] = useState<string | null>(null);
  const [doingCustom, setDoingCustom] = useState('');
  const [extraContext, setExtraContext] = useState('');

  const mood = feelCustom.trim() || feelChip || '';
  const scene = doingCustom.trim() || doingChip || '';
  const canCreate = Boolean(mood && scene) && !disabled;
  const canAdvance = !disabled && (step === 1 ? Boolean(mood) : step === 2 ? Boolean(scene) : Boolean(mood && scene));
  const ctaLabel = disabled ? 'Creating Session' : step < 3 ? 'Next' : 'Create Session';

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
    setStep((current) => Math.max(current, 2));
  };

  const onDoingChip = (value: string) => {
    setDoingChip(value);
    setDoingCustom('');
    setStep((current) => Math.max(current, 3));
  };

  const goToStep = (nextStep: number) => {
    if (nextStep === 2 && !mood) return;
    if (nextStep === 3 && !scene) return;
    setStep(nextStep);
  };

  const handlePrimary = () => {
    if (!canAdvance) return;
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }

    const context = extraContext.trim();
    onStart({
      mood,
      scene: context ? `${scene}; ${context}` : scene,
      duration_min: 25,
    });
  };

  const handleSoftInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handlePrimary();
  };

  const handleContextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    handlePrimary();
  };

  return (
    <div className={styles.root}>
      <div className={styles.cardHeader}>
        <div className={styles.stepNav} aria-label="Session setup steps">
          {STEPS.map((item) => {
            const locked = (item.id === 2 && !mood) || (item.id === 3 && !scene);
            const complete = (item.id === 1 && Boolean(mood)) || (item.id === 2 && Boolean(scene));
            return (
              <button
                key={item.id}
                type="button"
                className={cn(styles.stepPill, step === item.id && styles.stepPillActive, complete && styles.stepPillComplete)}
                onClick={() => goToStep(item.id)}
                disabled={disabled || locked}
                aria-current={step === item.id ? 'step' : undefined}
              >
                <span>{item.id}</span>
              </button>
            );
          })}
        </div>
        <p className={styles.stepCount}>Step {step} of 3</p>
      </div>

      <div className={styles.flow}>
        <section className={cn(styles.stepPanel, step === 1 && styles.stepPanelActive)}>
          <div className={styles.stepCopy}>
            <h2>{STEPS[0].title}</h2>
            <p>{STEPS[0].caption}</p>
          </div>

          <fieldset className={styles.moodSelector} disabled={disabled} aria-label="Mood selector">
            <legend className={styles.srOnly}>How do you feel today?</legend>
            {FEEL_OPTIONS.map((option) => {
              const active = feelChip === option.value && !feelCustom.trim();
              const icon = MOOD_ICON_BY_VALUE[option.value] ?? 'orb';
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(styles.moodCard, active && styles.moodCardActive)}
                  onClick={() => onFeelChip(option.value)}
                  aria-pressed={active}
                >
                  <span className={styles.moodIcon} data-icon={icon} aria-hidden />
                  <span className={styles.moodLabel}>{option.label}</span>
                </button>
              );
            })}
          </fieldset>

          <input
            className={styles.softInput}
            type="text"
            placeholder="Or name the feeling in your own words"
            value={feelCustom}
            onChange={(e) => onFeelCustomChange(e.target.value)}
            onKeyDown={handleSoftInputKeyDown}
            disabled={disabled}
            aria-label="How you feel, in your own words"
          />
        </section>

        <section className={cn(styles.stepPanel, step === 2 && styles.stepPanelActive, !mood && styles.stepPanelMuted)}>
          <div className={styles.stepCopy}>
            <h2>{STEPS[1].title}</h2>
            <p>{STEPS[1].caption}</p>
          </div>

          <fieldset className={styles.activitySelector} disabled={disabled || !mood} aria-label="Activity selector">
            <legend className={styles.srOnly}>What are you doing?</legend>
            {DOING_OPTIONS.map((option, index) => {
              const active = doingChip === option.value && !doingCustom.trim();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(styles.activityCard, active && styles.activityCardActive)}
                  onClick={() => onDoingChip(option.value)}
                  aria-pressed={active}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{option.label}</strong>
                </button>
              );
            })}
          </fieldset>

          <input
            className={styles.softInput}
            type="text"
            placeholder="Or describe the moment"
            value={doingCustom}
            onChange={(e) => onDoingCustomChange(e.target.value)}
            onKeyDown={handleSoftInputKeyDown}
            disabled={disabled || !mood}
            aria-label="What you are doing, in your own words"
          />
        </section>

        <section className={cn(styles.stepPanel, step === 3 && styles.stepPanelActive, !scene && styles.stepPanelMuted)}>
          <div className={styles.stepCopy}>
            <h2>{STEPS[2].title}</h2>
            <p>{STEPS[2].caption}</p>
          </div>

          <textarea
            className={styles.contextInput}
            placeholder="A memory, tempo, artist direction, or boundary for this session"
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            onKeyDown={handleContextKeyDown}
            disabled={disabled || !scene}
            aria-label="Optional note for Auracle"
          />
        </section>
      </div>

      <footer className={styles.sessionBar}>
        <div className={styles.wave} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>Auracle will blend {tasteSummary}, {memorySummary}, and this moment to create your station.</p>
        <button type="button" className={styles.primaryButton} disabled={step === 3 ? !canCreate : !canAdvance} onClick={handlePrimary}>
          {ctaLabel}
          <span aria-hidden>{'->'}</span>
        </button>
      </footer>
    </div>
  );
}
