import { useRadioState } from '../context/RadioSessionContext';
import { useTrackMeta } from '../hooks/useTrackCatalog';
import { cn } from '../lib/cn';
import styles from './TrackQueue.module.css';

export function TrackQueue() {
  const state = useRadioState();
  const current = useTrackMeta(state.trackId);

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
        {state.remainingTrackIds.map((id, i) => (
          <TrackQueueItem key={id} id={id} index={i + 2} />
        ))}
      </ul>
    </aside>
  );
}

function TrackQueueItem({ id, index }: { id: string; index: number }) {
  const track = useTrackMeta(id);
  return (
    <li className={styles.item}>
      <span className={styles.index}>{index}</span>
      <div>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
      </div>
    </li>
  );
}
