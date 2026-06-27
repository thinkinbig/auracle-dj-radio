import { DJ_NAME } from '@/shared/lib/constants';
import styles from './AppBrand.module.css';

interface AppBrandProps {
  onClick?: () => void;
  label?: string;
}

export function AppBrand({ onClick, label = DJ_NAME }: AppBrandProps) {
  const className = styles.brand;
  const content = (
    <>
      <svg className={styles.mark} viewBox="0 0 36 36" aria-hidden focusable="false">
        <defs>
          <linearGradient id="auracle-brand-gradient" x1="5" y1="30" x2="31" y2="6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#81eaa0" />
            <stop offset="0.38" stopColor="#9bbfa7" />
            <stop offset="0.58" stopColor="#b5b9b9" />
            <stop offset="0.78" stopColor="#705982" />
            <stop offset="1" stopColor="#111712" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="13.2" fill="none" stroke="url(#auracle-brand-gradient)" strokeWidth="7.2" />
      </svg>
      <strong>{DJ_NAME}</strong>
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
