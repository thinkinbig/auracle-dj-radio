import type { FlowTrackRef } from '@auracle/shared';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { isSessionComplete, selectQueueRefresh } from '@/features/radio/session/playbackSelectors';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { LoreDisclosure } from '@/shared/ui/LoreDisclosure';
import { cn } from '@/shared/lib/cn';
import { SessionCompletePanel } from './SessionCompletePanel';
import styles from './SessionSummary.module.css';

export function SessionSummary() {
  const state = useRadioState();
  const { handleRetryExtend, handleReturnToSetup } = useRadioActions();
  if (state.sessionTracklist.length === 0) return null;

  const complete = isSessionComplete(state.phase);
  const refresh = selectQueueRefresh(state);
  const extendPending = complete && refresh.pending;
  const extendFailed = complete && refresh.failed;

  const playedCount = Math.max(0, state.currentTrackIndex);
  const remainingCount = Math.max(0, state.sessionTracklist.length - state.currentTrackIndex - 1);

  return (
    <section className={styles.root} aria-label="Generated session summary">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{complete ? 'Session complete' : 'Generated session'}</p>
          <h2 className={styles.title}>{state.sessionTitle}</h2>
          {complete ? (
            <SessionCompletePanel
              part="copy"
              surface="summary"
              extendPending={extendPending}
              extendFailed={extendFailed}
              onRetry={handleRetryExtend}
              onNewSession={handleReturnToSetup}
              className={styles.completeCopy}
            />
          ) : null}
        </div>
        <div className={styles.metrics} aria-label="Session progress">
          <span>{playedCount} played</span>
          <span>{remainingCount} queued</span>
        </div>
      </div>

      {complete ? (
        <SessionCompletePanel
          part="actions"
          surface="summary"
          extendPending={extendPending}
          extendFailed={extendFailed}
          onRetry={handleRetryExtend}
          onNewSession={handleReturnToSetup}
          className={styles.completeActions}
          primaryButtonClassName={styles.completePrimary}
          secondaryButtonClassName={styles.completeSecondary}
        />
      ) : null}

      <ol className={styles.list}>
        {state.sessionTracklist.map((trackRef, index) => (
          <SummaryTrack
            key={`${trackRef.flow_position}-${trackRef.id}`}
            trackRef={trackRef}
            index={index}
            status={index < state.currentTrackIndex ? 'played' : index === state.currentTrackIndex ? 'live' : 'queued'}
          />
        ))}
      </ol>
    </section>
  );
}

function SummaryTrack({
  trackRef,
  index,
  status,
}: {
  trackRef: FlowTrackRef;
  index: number;
  status: 'played' | 'live' | 'queued';
}) {
  const track = useTrackMeta(trackRef.id);
  const label = status === 'live' ? 'Live' : status === 'played' ? 'Played' : 'Queued';
  const lore = track.lore.trim();
  const canShowLore = lore && status !== 'queued';

  return (
    <li className={cn(styles.item, status === 'live' && styles.itemLive)}>
      <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
      {track.albumCoverUrl ? (
        <img className={styles.cover} src={track.albumCoverUrl} alt="" width={40} height={40} loading="lazy" />
      ) : (
        <span className={styles.coverFallback} aria-hidden />
      )}
      <div className={styles.trackText}>
        <div className={styles.trackLine}>
          <p className={styles.trackTitle}>{track.title}</p>
          <span className={styles.status}>{label}</span>
        </div>
        <p className={styles.artist}>{track.artist}</p>
        <p className={styles.reason}>{trackRef.reason}</p>
        {canShowLore ? (
          <LoreDisclosure
            lore={lore}
            id={`summary-lore-${trackRef.flow_position}-${trackRef.id}`}
            bodyClassName={styles.lore}
          />
        ) : null}
      </div>
    </li>
  );
}
