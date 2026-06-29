import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { HostMode } from '@auracle/shared';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useBarCount } from '@/shared/hooks/useBarCount';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import { SpotifyPlaybackControl } from '@/features/spotify/SpotifyPlaybackControl';
import { useSpotifyPlaybackState } from '@/features/spotify/spotifyPlayback';
import {
  canSkipTrack,
  hostModeDisabled,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '@/features/radio/session/playbackSelectors';
import {
  IconMic,
  IconPause,
  IconPlay,
  IconRepeat,
  IconShuffle,
  IconSkipNext,
  IconSkipPrevious,
  IconSparkles,
  IconLeaf,
  IconZap,
} from '@/shared/ui/Icons';
import styles from './MiniControlBar.module.css';

const HOST_MODE_OPTIONS: Array<{ value: HostMode; label: string; Icon: typeof IconSparkles }> = [
  { value: 'curator', label: 'Guide', Icon: IconSparkles },
  { value: 'set_dj', label: 'Quiet', Icon: IconLeaf },
  { value: 'hype', label: 'Energy', Icon: IconZap },
];

export function MiniControlBar() {
  const state = useRadioState();
  const track = useTrackMeta(state.trackId);
  const spotify = useSpotifyPlaybackState();
  const spotifyTrack = spotify.enabled ? spotify.queueTracks[state.currentTrackIndex] : undefined;
  const {
    handleTogglePause,
    handleSkipTrack,
    handleContinue,
    handleChangeHostMode,
    handleTalkStart,
    handleTalkEnd,
  } = useRadioActions();
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const skipDisabled = !canSkipTrack(state);
  const modeDisabled = hostModeDisabled(state);
  const pct = playbackProgressPct(state);
  const displayTitle = spotifyTrack?.title ?? state.trackTitle;
  const displayArtist = spotifyTrack?.artist ?? state.artist;
  const currentCoverUrl = spotifyTrack?.albumCoverUrl || state.albumCoverUrl || track.albumCoverUrl;

  return (
    <footer className={styles.root} aria-label="Playback controls">
      <div className={styles.trackCard}>
        {currentCoverUrl ? (
          <img className={styles.cover} src={currentCoverUrl} alt="" width={52} height={52} loading="lazy" />
        ) : null}
        <div className={styles.trackCopy}>
          <p>{displayTitle}</p>
          <span>{displayArtist}</span>
        </div>
      </div>

      <div className={styles.timeline}>
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
      </div>

      <div className={styles.transport} aria-label="Track transport">
        <button type="button" className={styles.btnGhost} disabled aria-label="Shuffle unavailable">
          <IconShuffle size={16} />
        </button>
        <button type="button" className={styles.btnGhost} disabled aria-label="Previous track unavailable">
          <IconSkipPrevious size={18} />
        </button>
        <button
          type="button"
          className={styles.playBtn}
          onClick={idle ? undefined : handleTogglePause}
          disabled={curating || idle}
          aria-label={idle ? 'Start from onboarding' : paused ? 'Resume' : 'Pause'}
        >
          {idle || paused ? <IconPlay size={20} /> : <IconPause size={20} />}
        </button>

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
            className={styles.btnGhost}
            onClick={handleSkipTrack}
            disabled={skipDisabled}
            aria-label="Next track"
          >
            <IconSkipNext size={18} />
          </button>
        )}
        <button type="button" className={styles.btnGhost} disabled aria-label="Repeat unavailable">
          <IconRepeat size={16} />
        </button>
      </div>

      <div className={styles.rightControls}>
        {!idle && <SpotifyPlaybackControl compact />}
        {!idle && (
          <div className={styles.hostModes} aria-label="Host mode">
            {HOST_MODE_OPTIONS.map((option) => {
              const active = state.hostMode === option.value;
              const ModeIcon = option.Icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(styles.hostMode, active && styles.hostModeActive)}
                  onClick={() => handleChangeHostMode(option.value)}
                  disabled={modeDisabled}
                  aria-pressed={active}
                  aria-label={`Switch host mode to ${option.label}`}
                  title={option.label}
                >
                  <ModeIcon size={18} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {!idle && !curating && !state.inBreak && (
          <button
            type="button"
            className={cn(styles.btn, state.isTalking && styles.btnTalkActive)}
            onPointerDown={handleTalkStart}
            onPointerUp={handleTalkEnd}
            onPointerLeave={handleTalkEnd}
            aria-label="Hold to talk to AI host"
            aria-pressed={state.isTalking}
          >
            <IconMic size={16} />
          </button>
        )}
      </div>
    </footer>
  );
}
