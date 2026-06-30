import type { AuthUser } from '@auracle/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logout as logoutApi, restoreUser } from '@/features/marketing/authApi';
import { clearUserQueries } from '@/shared/query/queryClient';

interface AuthContextValue {
  user: AuthUser | undefined;
  isRestoringUser: boolean;
  setUser: (user: AuthUser | undefined) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | undefined>();
  const [isRestoringUser, setIsRestoringUser] = useState(true);

  useEffect(() => {
    let cancelled = false;
    restoreUser().then((restoredUser) => {
      if (cancelled) return;
      setUser(restoredUser);
      setIsRestoringUser(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    void logoutApi();
    clearUserQueries();
    setUser(undefined);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isRestoringUser,
      setUser,
      logout,
    }),
    [user, isRestoringUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
