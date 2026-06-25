import { DJ_NAME } from '@/shared/lib/constants';
import styles from './AppBrand.module.css';

interface AppBrandProps {
  onClick?: () => void;
  label?: string;
}

export function AppBrand({ onClick, label = DJ_NAME }: AppBrandProps) {
  const className = `${styles.brand} ${styles.wordmark}`;
  const content = <span>{DJ_NAME}</span>;

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
