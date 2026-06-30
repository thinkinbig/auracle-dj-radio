import { IconChevronUp } from '@/shared/ui/icons';
import { cn } from '@/shared/lib/cn';
import styles from './LoreToggle.module.css';

export interface LoreToggleProps {
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
  variant?: 'inline' | 'icon';
  tone?: 'purple' | 'library';
  ariaLabel?: string;
}

export function LoreToggle({
  expanded,
  onToggle,
  controlsId,
  variant = 'inline',
  tone = 'purple',
  ariaLabel,
}: LoreToggleProps) {
  const isIcon = variant === 'icon';

  return (
    <button
      type="button"
      className={cn(
        styles.toggle,
        isIcon ? styles.toggleIcon : styles.toggleInline,
        tone === 'library' && styles.toggleLibrary,
      )}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={isIcon ? (ariaLabel ?? (expanded ? 'Hide track story' : 'Show track story')) : undefined}
      onClick={onToggle}
    >
      {!isIcon ? (expanded ? 'Hide story' : 'Track story') : null}
      <IconChevronUp
        size={isIcon ? 16 : 14}
        className={cn(styles.chevron, !isIcon && !expanded && styles.chevronCollapsed)}
      />
    </button>
  );
}
