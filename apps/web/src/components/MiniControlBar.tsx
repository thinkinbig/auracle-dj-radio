import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useRadioActions, useRadioState } from '../context/RadioSessionContext';
import { useBarCount } from '../hooks/useBarCount';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import {
  canSkipTrack,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '../lib/playbackSelectors';
import { IconMic, IconPause, IconPlay, IconSend, IconSkipNext, IconSkipVoice, IconText } from './Icons';
import styles from './MiniControlBar.module.css';

export function MiniControlBar() {
  const state = useRadioState();
  const { handleTogglePause, handleSkipTrack, handleSkipDj, handleContinue, handleTalkStart, handleTalkEnd, handleSendText } =
    useRadioActions();
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const skipDisabled = !canSkipTrack(state);
  const pct = playbackProgressPct(state);

  // Text barge-in composer (sibling to push-to-talk). Available in the same
  // contexts as the mic: an active session that isn't curating or in a break.
  const canConverse = !idle && !curating && !state.inBreak;
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const composerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (composerOpen) composerInputRef.current?.focus();
  }, [composerOpen]);

  useEffect(() => {
    if (!canConverse) {
      setComposerOpen(false);
      setComposerText('');
    }
  }, [canConverse]);

  const submitComposer = (e: FormEvent) => {
    e.preventDefault();
    const text = composerText.trim();
    if (!text) return;
    handleSendText(text);
    setComposerText('');
    setComposerOpen(false);
  };

  return (
    <footer className={styles.root} aria-label="Playback controls">
      {composerOpen && canConverse && (
        <form id="dj-composer" className={styles.composer} onSubmit={submitComposer}>
          <input
            ref={composerInputRef}
            className={styles.composerInput}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setComposerOpen(false);
            }}
            placeholder="Message the DJ…"
            aria-label="Message to the DJ"
            enterKeyHint="send"
            maxLength={500}
          />
          <button
            type="submit"
            className={styles.composerSend}
            disabled={!composerText.trim()}
            aria-label="Send message"
          >
            <IconSend size={16} />
          </button>
        </form>
      )}
      <time className={styles.time}>{formatTime(state.progressSec)}</time>

      <div
        ref={waveRef}
        className={styles.wave}
        style={{ '--bar-count': barCount } as CSSProperties}
        aria-hidden
      >
        {Array.from({ length: barCount }, (_, i) => {
          const threshold = (i / barCount) * 100;
          const active = threshold <= pct;
          return <span key={i} className={cn(styles.bar, active && styles.barActive)} />;
        })}
      </div>

      <time className={styles.timeEnd}>{formatTime(state.durationSec)}</time>

      {state.phase === 'speaking' && (
        <button
          type="button"
          className={styles.btn}
          onClick={handleSkipDj}
          aria-label="Skip voice-over"
        >
          <IconSkipVoice size={16} />
        </button>
      )}

      {state.inBreak ? (
        <button
          type="button"
          className={styles.continueBtn}
          onClick={handleContinue}
          aria-label="Continue to next track"
        >
          {state.phase === 'listening' ? <IconMic size={14} /> : null}
          Continue
        </button>
      ) : (
        <button
          type="button"
          className={styles.btn}
          onClick={handleSkipTrack}
          disabled={skipDisabled}
          aria-label="Next track"
        >
          <IconSkipNext size={16} />
        </button>
      )}

      {canConverse && (
        <>
          <button
            type="button"
            className={cn(styles.btn, composerOpen && styles.btnTextActive)}
            onClick={() => setComposerOpen((o) => !o)}
            aria-label="Type a message to the DJ"
            aria-expanded={composerOpen}
            aria-controls="dj-composer"
          >
            <IconText size={16} />
          </button>
          <button
            type="button"
            className={cn(styles.btn, state.isTalking && styles.btnTalkActive)}
            onPointerDown={handleTalkStart}
            onPointerUp={handleTalkEnd}
            onPointerLeave={handleTalkEnd}
            aria-label="Hold to talk to DJ"
            aria-pressed={state.isTalking}
          >
            <IconMic size={16} />
          </button>
        </>
      )}

      <button
        type="button"
        className={styles.btn}
        onClick={idle ? undefined : handleTogglePause}
        disabled={curating || idle}
        aria-label={idle ? 'Start from onboarding' : paused ? 'Resume' : 'Pause'}
      >
        {idle || paused ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </footer>
  );
}
