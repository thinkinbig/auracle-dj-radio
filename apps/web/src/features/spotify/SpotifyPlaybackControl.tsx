import {
  connectSpotifyPlayback,
  disconnectSpotifyPlayback,
  signOutSpotify,
  useSpotifyPlaybackState,
} from './spotifyPlayback';
import { getSpotifyConfig } from './spotifyAuth';
import type { SpotifyPlaybackState } from './spotifyPlayback';
import { cn } from '@/shared/lib/cn';
import styles from './SpotifyPlaybackControl.module.css';

interface SpotifyPlaybackControlProps {
  compact?: boolean;
  className?: string;
}

export function SpotifyPlaybackControl({ compact = false, className }: SpotifyPlaybackControlProps) {
  const spotify = useSpotifyPlaybackState();
  const configured = getSpotifyConfig() !== null;
  const connected = spotify.authStatus === 'signed_in';
  const active = connected && spotify.enabled;
  const busy = spotify.playerStatus === 'connecting';
  const label = resolveStatusLabel(spotify);

  async function enableSpotifyMode() {
    if (!configured) return;
    await connectSpotifyPlayback();
  }

  function enableLocalMode() {
    disconnectSpotifyPlayback();
  }

  return (
    <div className={cn(styles.root, compact && styles.compact, active && styles.active, className)}>
      <span className={styles.mark} aria-hidden />
      <div className={styles.copy}>
        <strong>{compact ? 'Source' : 'Playback source'}</strong>
        <small>{label}</small>
      </div>
      <div className={styles.actions}>
        {connected ? (
          <div className={styles.modeSwitch} aria-label="Playback source">
            <button
              type="button"
              className={cn(styles.modeButton, !active && styles.modeButtonActive)}
              onClick={enableLocalMode}
              aria-pressed={!active}
              aria-label="Use local files"
              title="Local files"
            >
              <FilesGlyph />
              <span className={styles.buttonLabel}>Local</span>
            </button>
            <button
              type="button"
              className={cn(styles.modeButton, active && styles.modeButtonActive)}
              onClick={() => void enableSpotifyMode()}
              disabled={busy}
              aria-pressed={active}
              aria-label={busy ? 'Connecting Spotify' : 'Use Spotify library'}
              title={busy ? 'Connecting Spotify' : 'Spotify library'}
            >
              <SpotifyGlyph />
              <span className={styles.buttonLabel}>{busy ? 'Wait' : 'Spotify'}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => void enableSpotifyMode()}
            disabled={!configured || busy}
          >
            <SpotifyGlyph />
            <span>{!configured ? 'Setup Spotify' : busy ? 'Connecting' : 'Connect Spotify'}</span>
          </button>
        )}
        {!compact && connected ? (
          <button type="button" className={styles.secondary} onClick={signOutSpotify}>
            Sign out
          </button>
        ) : null}
      </div>
      {!compact && spotify.error ? (
        connected && !active ? (
          // Signed in but Spotify isn't usable (SDK blocked, not Premium, connect
          // failed) → the session falls back to local-only. Spell out the
          // consequence prominently so it isn't mistaken for a silent local choice.
          <p className={styles.banner} role="alert">
            <strong>Spotify unavailable — playing local tracks only.</strong>
            <span>{spotify.error}</span>
            {/sdk/i.test(spotify.error) ? (
              <span>
                An ad blocker is likely blocking Spotify&apos;s player (sdk.scdn.co). Allow it for
                this site (or pause the blocker) and reconnect.
              </span>
            ) : null}
          </p>
        ) : (
          <p className={styles.error}>{spotify.error}</p>
        )
      ) : null}
    </div>
  );
}

function resolveStatusLabel(spotify: SpotifyPlaybackState): string {
  if (spotify.error) return spotify.error;
  if (spotify.authStatus === 'missing_config') return 'Add client id';
  if (spotify.authStatus === 'signed_out') return 'Premium playback';
  if (spotify.authStatus === 'error') return 'Needs reconnect';
  if (!spotify.enabled) return 'Local file catalog';
  if (spotify.gatherStatus === 'loading') return 'Reading liked tracks';
  if (spotify.gatherError) return spotify.gatherError;
  if (spotify.playerStatus === 'ready') return 'Spotify library mixed in';
  if (spotify.playerStatus === 'connecting') return 'Connecting';
  if (spotify.playerStatus === 'error') return 'Player error';
  return 'Spotify library mixed in';
}

function FilesGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h3.8l2 2H18a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6.5A2.5 2.5 0 0 1 4 16.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SpotifyGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M8 9.4c2.9-.8 5.8-.5 8.2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.6 12.2c2.2-.6 4.6-.4 6.6.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.3 14.8c1.6-.3 3.3-.2 4.8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
