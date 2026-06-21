import { DJ_NAME } from '@/shared/lib/constants';
import styles from './AppBrand.module.css';

interface AppBrandProps {
  onClick?: () => void;
  label?: string;
}

export function AppBrand({ onClick, label = DJ_NAME }: AppBrandProps) {
  const content = (
    <>
      <span className={styles.mark} aria-hidden>
        A
      </span>
      <span>{DJ_NAME}</span>
    </>
  );

  if (onClick) {
    return (
      <button className={styles.brand} type="button" onClick={onClick} aria-label={label} title={label}>
        {content}
      </button>
    );
  }

  return (
    <div className={styles.brand} aria-label={label}>
      {content}
    </div>
  );
}
