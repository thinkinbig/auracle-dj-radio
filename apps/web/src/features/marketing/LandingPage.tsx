import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@auracle/shared';
import { DJ_NAME } from '@/shared/lib/constants';
import { login, register } from './authApi';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  onEnterApp: (user: AuthUser) => void;
}

type View = 'landing' | 'login';
type AuthMode = 'login' | 'register';

const guestUser: AuthUser = {
  id: 'guest',
  email: 'guest@auracle.local',
  name: 'Guest Listener',
};

export function LandingPage({ onEnterApp }: LandingPageProps) {
  const [view, setView] = useState<View>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState<string | undefined>();
  const [authNotice, setAuthNotice] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrandTransitioning, setIsBrandTransitioning] = useState(false);
  const transitionTimerRef = useRef<number | undefined>();

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  function switchAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setAuthError(undefined);
    setAuthNotice(undefined);
  }

  function runBrandTransition(onComplete: () => void) {
    if (isBrandTransitioning) return;
    setIsBrandTransitioning(true);
    transitionTimerRef.current = window.setTimeout(() => {
      onComplete();
      transitionTimerRef.current = window.setTimeout(() => {
        setIsBrandTransitioning(false);
      }, 260);
    }, 320);
  }

  function showAuth(mode: AuthMode) {
    switchAuthMode(mode);
    if (view === 'login') return;
    runBrandTransition(() => setView('login'));
  }

  function enterApp(user: AuthUser) {
    if (view === 'landing') {
      runBrandTransition(() => onEnterApp(user));
      return;
    }
    onEnterApp(user);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const name = String(formData.get('name') ?? '');
    const remember = formData.get('remember') === 'on';

    setAuthError(undefined);
    setAuthNotice(undefined);
    setIsSubmitting(true);
    try {
      const response =
        authMode === 'register'
          ? await register({ email, password, name }, remember)
          : await login({ email, password }, remember);
      enterApp(response.user);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          {view === 'login' || isBrandTransitioning ? (
            <button
              className={`${styles.brand} ${isBrandTransitioning ? styles.brandEntering : ''}`}
              type="button"
              onClick={() => setView('landing')}
              disabled={isBrandTransitioning}
            >
              <span className={styles.mark} aria-hidden>
                A
              </span>
              <span>{DJ_NAME}</span>
            </button>
          ) : (
            <span className={styles.brandPlaceholder} aria-hidden />
          )}
          <nav className={styles.nav} aria-label="Primary">
            <a href="#stations">Stations</a>
            <a href="#sound">Sound</a>
            <a href="#studio">Studio</a>
          </nav>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => showAuth('login')}
            disabled={isBrandTransitioning}
          >
            Log in
          </button>
        </header>

        {view === 'landing' ? (
          <main className={`${styles.hero} ${isBrandTransitioning ? styles.heroLeaving : ''}`}>
            <section className={styles.copy} aria-labelledby="landing-title">
              <p className={styles.eyebrow}>Live AI radio for every mood</p>
              <h1 id="landing-title">Auracle</h1>
              <p className={styles.lede}>
                A polished web radio player that turns your mood into a hosted station, with DJ talk,
                smart queues, and a cinematic listening room.
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => showAuth('register')}
                  disabled={isBrandTransitioning}
                >
                  Start listening
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => enterApp(guestUser)}
                  disabled={isBrandTransitioning}
                >
                  Try demo
                </button>
              </div>
              <div className={styles.metrics} aria-label="Product highlights">
                <span>
                  <strong>24/7</strong>
                  adaptive station
                </span>
                <span>
                  <strong>16</strong>
                  curated tracks
                </span>
                <span>
                  <strong>Live</strong>
                  DJ voice
                </span>
              </div>
            </section>

            <section className={styles.playerShowcase} aria-label="Auracle web player preview">
              <div className={styles.albumStack} aria-hidden>
                <div className={styles.albumBack} />
                <div className={styles.albumArt}>
                  <span />
                </div>
              </div>
              <div className={styles.nowPlaying}>
                <div>
                  <p className={styles.status}>On air now</p>
                  <h2>Midnight Signal</h2>
                  <p>Auracle DJ is blending soft house, vocal texture, and late-night focus.</p>
                </div>
                <div className={styles.waveform} aria-hidden>
                  {Array.from({ length: 24 }, (_, index) => (
                    <span
                      key={index}
                      style={{ '--level': `${24 + ((index * 17) % 54)}%` } as CSSProperties}
                    />
                  ))}
                </div>
                <div className={styles.trackRow}>
                  <span>01</span>
                  <div>
                    <strong>Velvet Room</strong>
                    <small>Nova Pulse</small>
                  </div>
                  <em>3:42</em>
                </div>
                <div className={styles.trackRow}>
                  <span>02</span>
                  <div>
                    <strong>Glass Coast</strong>
                    <small>Mirrorline</small>
                  </div>
                  <em>4:08</em>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <main className={styles.loginStage}>
            <section className={styles.loginIntro} aria-labelledby="login-title">
              <p className={styles.eyebrow}>Welcome back</p>
              <h1 id="login-title">
                {authMode === 'register' ? 'Create your listening space.' : 'Tune in where you left off.'}
              </h1>
              <p>
                Save your station history, keep your preferences, and return to a personal radio room
                that feels ready before the first track starts.
              </p>
            </section>
            <form className={styles.loginCard} onSubmit={handleSubmit}>
              <div className={styles.authSwitch} role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'login'}
                  className={authMode === 'login' ? styles.activeTab : undefined}
                  onClick={() => switchAuthMode('login')}
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'register'}
                  className={authMode === 'register' ? styles.activeTab : undefined}
                  onClick={() => switchAuthMode('register')}
                >
                  Sign up
                </button>
              </div>
              {authMode === 'register' ? (
                <label>
                  Name
                  <input type="text" name="name" placeholder="Your name" autoComplete="name" />
                </label>
              ) : null}
              <label>
                Email
                <input type="email" name="email" placeholder="you@example.com" autoComplete="email" required />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
              </label>
              {authError ? <p className={styles.errorText} role="alert">{authError}</p> : null}
              {authNotice ? <p className={styles.noticeText}>{authNotice}</p> : null}
              <div className={styles.formRow}>
                <label className={styles.check}>
                  <input type="checkbox" name="remember" defaultChecked />
                  Keep me signed in
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(undefined);
                    setAuthNotice('Password reset is simulated in this demo. Create a new account or use guest mode.');
                  }}
                >
                  Forgot?
                </button>
              </div>
              <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Checking...' : authMode === 'register' ? 'Create account' : 'Log in'}
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => onEnterApp(guestUser)}>
                Continue as guest
              </button>
            </form>
          </main>
        )}
      </div>
    </div>
  );
}
