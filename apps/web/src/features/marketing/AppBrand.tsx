import { DJ_NAME } from '@/shared/lib/constants';
import styles from './AppBrand.module.css';

interface AppBrandProps {
  onClick?: () => void;
  label?: string;
  variant?: 'mark' | 'wordmark';
}

export function AppBrand({ onClick, label = DJ_NAME, variant = 'mark' }: AppBrandProps) {
  const className = `${styles.brand} ${variant === 'wordmark' ? styles.wordmark : ''}`;
  const content = (
    <>
      {variant === 'mark' && (
        <span className={styles.mark} aria-hidden>
          A
        </span>
      )}
      <span>{DJ_NAME}</span>
    </>
  );

  if (onClick) {
    return (
      <button className={className} type="button" onClick={onClick} aria-label={label} title={label}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} aria-label={label}>
      {content}
    </div>
  );
}
