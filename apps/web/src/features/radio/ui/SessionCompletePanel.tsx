import { deriveSessionCompleteCopy, type SessionCompleteSurface } from '@/features/radio/session/sessionComplete';
import { cn } from '@/shared/lib/cn';
import styles from './SessionCompletePanel.module.css';

export type SessionCompletePart = 'full' | 'copy' | 'actions';

export interface SessionCompletePanelProps {
  surface: SessionCompleteSurface;
  extendPending: boolean;
  extendFailed: boolean;
  onRetry: () => void;
  onNewSession: () => void;
  part?: SessionCompletePart;
  className?: string;
  primaryButtonClassName?: string;
  secondaryButtonClassName?: string;
}

export function SessionCompletePanel({
  surface,
  extendPending,
  extendFailed,
  onRetry,
  onNewSession,
  part = 'full',
  className,
  primaryButtonClassName,
  secondaryButtonClassName,
}: SessionCompletePanelProps) {
  const copy = deriveSessionCompleteCopy(surface, extendPending, extendFailed);

  if (part === 'copy') {
    return (
      <p className={className} role="status" aria-live="polite">
        {copy.body}
      </p>
    );
  }

  if (part === 'actions') {
    if (surface === 'summary' && !extendFailed) return null;

    return (
      <div className={cn(styles.actions, className)} role="status" aria-live="polite">
        {extendFailed ? (
          <button type="button" className={cn(styles.primaryButton, primaryButtonClassName)} onClick={onRetry}>
            Continue listening
          </button>
        ) : null}
        <button type="button" className={cn(styles.secondaryButton, secondaryButtonClassName)} onClick={onNewSession}>
          New session
        </button>
      </div>
    );
  }

  if (extendPending) {
    return (
      <div className={cn(styles.root, className)} role="status" aria-live="polite">
        <p className={styles.copy}>{copy.body}</p>
      </div>
    );
  }

  return (
    <div className={cn(styles.root, className)} role="status" aria-live="polite">
      {copy.title ? <p className={styles.title}>{copy.title}</p> : null}
      <p className={styles.copy}>{copy.body}</p>
      {extendFailed || surface === 'controls' ? (
        <div className={styles.actions}>
          {extendFailed ? (
            <button
              type="button"
              className={cn(styles.primaryButton, primaryButtonClassName)}
              onClick={onRetry}
            >
              Continue listening
            </button>
          ) : null}
          <button
            type="button"
            className={cn(styles.secondaryButton, secondaryButtonClassName)}
            onClick={onNewSession}
          >
            New session
          </button>
        </div>
      ) : null}
    </div>
  );
}
