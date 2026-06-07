import { cn } from '../lib/cn';
import styles from './Skeleton.module.css';

type SkeletonVariant = 'text' | 'circle' | 'rect';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: SkeletonVariant;
  className?: string;
  'aria-hidden'?: boolean;
}

export function Skeleton({
  width,
  height,
  variant = 'text',
  className,
  'aria-hidden': ariaHidden = true,
}: SkeletonProps) {
  return (
    <span
      className={cn(styles.block, styles[variant], className)}
      style={{ width, height }}
      aria-hidden={ariaHidden}
    />
  );
}
