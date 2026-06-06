import { getTrackMeta } from '../lib/trackCatalog';
import { cn } from '../lib/cn';
import styles from './TrackQueue.module.css';

interface TrackQueueProps {
  currentTrackId: string;
  remainingTrackIds: string[];
}

export function TrackQueue({ currentTrackId, remainingTrackIds }: TrackQueueProps) {
  const current = getTrackMeta(currentTrackId);

  return (
    <aside className={styles.root} aria-label="Up next">
      <h3 className={styles.heading}>Up next</h3>

      <div className={cn(styles.item, styles.itemCurrent)}>
        <span className={styles.index}>▶</span>
        <div>
          <p className={styles.title}>{current.title}</p>
          <p className={styles.artist}>{current.artist}</p>
        </div>
      </div>

      <ul className={styles.list}>
        {remainingTrackIds.map((id, i) => {
          const track = getTrackMeta(id);
          return (
            <li key={id} className={styles.item}>
              <span className={styles.index}>{i + 2}</span>
              <div>
                <p className={styles.title}>{track.title}</p>
                <p className={styles.artist}>{track.artist}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
