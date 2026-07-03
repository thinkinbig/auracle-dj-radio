import { useState } from 'react';
import { IconArrowRight } from '@/shared/ui/icons';
import { buildSpotifyTasteRoast, type SpotifyTasteProfile } from './spotifyTaste';
import { useSpotifyTasteQuery } from './useSpotifyTasteQuery';
import styles from './SpotifyTasteSummaryPanel.module.css';

interface MoodProfile {
  label: string;
  percent: number;
  scores: Array<{ label: string; value: number }>;
}

export function SpotifyTasteSummaryPanel() {
  const query = useSpotifyTasteQuery();
  const profile = query.data;

  if (query.isPending) {
    return <div className={styles.emptyPanel}>Reading Spotify taste...</div>;
  }

  if (profile?.status === 'missing_config') {
    return <DisconnectedTastePreview />;
  }

  if (profile?.status === 'signed_out') {
    return <DisconnectedTastePreview />;
  }

  if (query.isError || !profile) {
    return <DisconnectedTastePreview />;
  }

  return <TasteDashboard profile={profile} />;
}

function DisconnectedTastePreview() {
  return (
    <div className={styles.previewDashboard} aria-label="Spotify taste preview">
      <section className={styles.previewHero}>
        <div>
          <p className={styles.previewKicker}>Spotify taste</p>
          <h2>Connect Spotify to unlock your taste map.</h2>
          <p>Auracle will turn your top artists, tracks, genres, liked songs, and recent plays into this profile.</p>
        </div>
        <div className={styles.previewPills} aria-hidden>
          <span>Genres</span>
          <span>Artists</span>
          <span>Tracks</span>
          <span>Mood</span>
        </div>
      </section>

      <div className={styles.previewGrid} aria-hidden>
        <section className={styles.previewCard}>
          <div className={styles.cardTitle}>
            <span>Top genre</span>
            <small>Locked</small>
          </div>
          <h3>Alternative</h3>
          <strong>--%</strong>
          <GenreLines />
        </section>

        <section className={styles.previewCard}>
          <div className={styles.cardTitle}>
            <span>Listening mood</span>
            <small>Locked</small>
          </div>
          <h3>Dreamy</h3>
          <strong>--%</strong>
          <MoodRing percent={64} />
        </section>

        <section className={styles.previewWide}>
          <div className={styles.cardTitle}>
            <span>Top artists</span>
            <small>Preview</small>
          </div>
          <div className={styles.previewArtists}>
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index}>
                <i />
                <b>{index + 1}</b>
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TasteDashboard({ profile }: { profile: SpotifyTasteProfile }) {
  const topGenre = profile.topGenres[0];
  const genreTotal = profile.topGenres.reduce((sum, genre) => sum + genre.count, 0);
  const genrePercent = topGenre ? Math.round((topGenre.count / Math.max(1, genreTotal)) * 100) : 0;
  const mood = buildMoodProfile(profile);
  const topArtists = profile.topArtists.slice(0, 5);
  const topTracks = profile.topTracks.slice(0, 10);

  return (
    <div className={styles.dashboard}>
      <section className={styles.genreCard} aria-label="Top genre">
        <div className={styles.cardTitle}>
          <span>Top genre</span>
        </div>
        <h2>{topGenre?.name ?? 'Still mapping'}</h2>
        <strong>{topGenre ? `${genrePercent}%` : '--'}</strong>
        <GenreLines />
        <div className={styles.genreLegend}>
          {profile.topGenres.length > 0
            ? profile.topGenres.slice(0, 4).map((genre) => (
              <span key={genre.name}>
                <i aria-hidden />
                {genre.name}
                <small>{Math.round((genre.count / Math.max(1, genreTotal)) * 100)}%</small>
              </span>
            ))
            : (
              <span>
                <i aria-hidden />
                Waiting for artist genres
                <small />
              </span>
            )}
        </div>
      </section>

      <section className={styles.moodCard} aria-label="Listening mood">
        <div className={styles.cardTitle}>
          <span>Listening mood</span>
        </div>
        <h2>{mood.label}</h2>
        <strong>{mood.percent}%</strong>
        <MoodRing percent={mood.percent} />
        <div className={styles.moodLegend}>
          {mood.scores.map((item) => (
            <span key={item.label}>
              <i aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.artistCard} aria-label="Top artists">
        <div className={styles.cardTitle}>
          <span>Top artists</span>
        </div>
        <div className={styles.artistRail}>
          {topArtists.length > 0 ? topArtists.map((artist, index) => (
            <article key={artist.id} className={styles.artistItem}>
              <div className={styles.avatarWrap}>
                {artist.imageUrl ? <img src={artist.imageUrl} alt="" loading="lazy" /> : <span aria-hidden />}
                <b>{index + 1}</b>
              </div>
              <strong>{artist.name}</strong>
            </article>
          )) : <p className={styles.muted}>Top artists will appear after Spotify has enough listening history.</p>}
        </div>
      </section>

      <section className={styles.trackCard} aria-label="Top tracks">
        <div className={styles.cardTitle}>
          <span>Top tracks</span>
        </div>
        <div className={styles.trackList}>
          {topTracks.length > 0 ? topTracks.map((track, index) => (
            <article key={track.id} className={styles.trackItem}>
              <span className={styles.trackRank}>{index + 1}</span>
              {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" /> : <i aria-hidden />}
              <span className={styles.trackCopy}>
                <strong>{track.name}</strong>
                <small>{track.artist}</small>
              </span>
            </article>
          )) : <p className={styles.muted}>Top tracks will appear after Spotify has enough listening history.</p>}
        </div>
      </section>

      <RoastCard profile={profile} />
    </div>
  );
}

function RoastCard({ profile }: { profile: SpotifyTasteProfile }) {
  const [revealed, setRevealed] = useState(false);
  const roast = buildSpotifyTasteRoast(profile);

  return (
    <section className={styles.roastCard} aria-label="Taste roast">
      <div className={styles.roastHeader}>
        <div>
          <div className={styles.cardTitle}>
            <span>Taste roast</span>
            <small>{revealed ? 'Revealed' : 'Opt-in'}</small>
          </div>
          <h2>{revealed ? roast.verdict : 'Your taste can take a joke.'}</h2>
          <p>
            {revealed
              ? roast.summary
              : 'A sharper read from your genres, repeats, artists, and saved-track habits.'}
          </p>
        </div>
        <div className={styles.roastMeter} aria-label={revealed ? `Roast score ${roast.scoreLabel}` : 'Roast score hidden'}>
          <strong>{revealed ? roast.scoreLabel : '--%'}</strong>
          <span>heat check</span>
        </div>
      </div>

      {revealed ? (
        <>
          <div className={styles.roastEvidence} aria-label="Roast evidence">
            {roast.evidence.map((item) => (
              <span key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <em>{item.detail}</em>
              </span>
            ))}
          </div>
          <div className={styles.roastBurns} aria-label="Roast lines">
            {roast.burns.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className={styles.roastTags} aria-label="Roast tags">
            {roast.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.roastPreview} aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}

      <button
        className={styles.roastButton}
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-expanded={revealed}
      >
        {revealed ? 'Hide roast' : 'Roast my taste'}
        <IconArrowRight size={18} />
      </button>
    </section>
  );
}

function GenreLines() {
  return (
    <svg className={styles.genreLines} viewBox="0 0 420 130" preserveAspectRatio="none" aria-hidden>
      <path d="M0 92 C42 72 62 72 92 78 C130 86 130 56 176 51 C226 45 250 73 288 65 C330 56 316 28 420 18" />
      <path d="M0 112 C56 88 76 91 110 88 C152 84 158 66 202 67 C252 67 260 91 302 82 C344 74 352 47 420 40" />
    </svg>
  );
}

function MoodRing({ percent }: { percent: number }) {
  const dots = Array.from({ length: 64 }, (_, index) => index);
  const activeCount = Math.round((Math.max(0, Math.min(100, percent)) / 100) * dots.length);

  return (
    <div className={styles.ring} aria-hidden>
      {dots.map((dot) => {
        const angle = (dot / dots.length) * 360;
        return (
          <i
            key={dot}
            className={dot < activeCount ? styles.ringDotActive : undefined}
            style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-82px)` }}
          />
        );
      })}
    </div>
  );
}

function buildMoodProfile(profile: SpotifyTasteProfile): MoodProfile {
  const text = [
    ...profile.topGenres.map((genre) => genre.name),
    ...profile.topArtists.flatMap((artist) => artist.genres),
    profile.summary,
    profile.hostSeed,
  ].join(' ').toLowerCase();
  const scores = [
    { label: 'Dreamy', value: scoreMood(text, ['dream', 'ambient', 'indie', 'shoegaze', 'bedroom', 'soul', 'r&b', 'slow']) },
    { label: 'Energetic', value: scoreMood(text, ['dance', 'pop', 'house', 'electronic', 'rock', 'party', 'punk', 'rap']) },
    { label: 'Melancholic', value: scoreMood(text, ['sad', 'emo', 'melanch', 'folk', 'blues', 'ballad', 'dark']) },
    { label: 'Chill', value: scoreMood(text, ['chill', 'lo-fi', 'jazz', 'acoustic', 'soft', 'study', 'calm']) },
  ].sort((a, b) => b.value - a.value);
  const top = scores[0] ?? { label: 'Curious', value: 0 };
  return {
    label: top.value > 0 ? top.label : 'Curious',
    percent: Math.max(32, Math.min(88, 48 + top.value * 8)),
    scores,
  };
}

function scoreMood(text: string, terms: string[]): number {
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}
