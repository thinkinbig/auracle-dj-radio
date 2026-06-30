import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import styles from './QueueTrackRow.module.css';

export interface QueueTrackRowProps {
  index: string | number;
  title: string;
  artist: string;
  durationSec: number;
  current?: boolean;
  changed?: boolean;
  as?: 'li' | 'div';
  variant?: 'panel' | 'drawer';
}

export function QueueTrackRow({
  index,
  title,
  artist,
  durationSec,
  current = false,
  changed = false,
  as: Tag = 'li',
  variant = 'panel',
}: QueueTrackRowProps) {
  return (
    <Tag
      data-queue-row={variant === 'drawer' ? '' : undefined}
      className={cn(
        styles.item,
        variant === 'drawer' && styles.itemDrawer,
        current && styles.itemCurrent,
        changed && styles.itemChanged,
      )}
    >
      <span className={styles.index}>{index}</span>
      <div className={styles.itemText}>
        <p className={styles.title}>{title}</p>
        <p className={styles.artist}>{artist}</p>
      </div>
      <span className={styles.duration}>{formatTime(durationSec)}</span>
    </Tag>
  );
}

export function QueueCurrentTrack({
  trackId,
  title,
  artist,
  durationSec,
  as = 'div',
  variant = 'panel',
}: {
  trackId?: string;
  title?: string;
  artist?: string;
  durationSec?: number;
  as?: 'li' | 'div';
  variant?: 'panel' | 'drawer';
}) {
  const meta = useTrackMeta(trackId ?? '');
  return (
    <QueueTrackRow
      as={as}
      variant={variant}
      index="▶"
      title={title ?? meta.title}
      artist={artist ?? meta.artist}
      durationSec={durationSec ?? meta.durationSec}
      current
    />
  );
}

export function QueueUpcomingTrack({
  id,
  index,
  changed,
  as = 'li',
  variant = 'panel',
}: {
  id: string;
  index: number;
  changed?: boolean;
  as?: 'li' | 'div';
  variant?: 'panel' | 'drawer';
}) {
  const track = useTrackMeta(id);
  return (
    <QueueTrackRow
      as={as}
      variant={variant}
      index={index}
      title={track.title}
      artist={track.artist}
      durationSec={track.durationSec}
      changed={changed}
    />
  );
}
