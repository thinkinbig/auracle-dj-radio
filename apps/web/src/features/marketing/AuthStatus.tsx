import type { AuthUser } from '@auracle/shared';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  user: AuthUser;
  onLogout: () => void;
}

export function AuthStatus({ user, onLogout }: AuthStatusProps) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  return (
    <div className={styles.accountBar} aria-label="Signed in account">
      <div className={styles.user}>
        <span className={styles.avatar} aria-hidden>
          {initials}
        </span>
        <span className={styles.userText}>
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
      </div>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
