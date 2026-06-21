import { DJ_NAME } from '@/shared/lib/constants';
import styles from './AppBrand.module.css';

export function AppBrand() {
  return (
    <div className={styles.brand} aria-label={DJ_NAME}>
      <span className={styles.mark} aria-hidden>
        A
      </span>
      <span>{DJ_NAME}</span>
    </div>
  );
}
