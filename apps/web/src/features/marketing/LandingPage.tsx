import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  REGISTER_PASSWORD_HINT,
  REGISTER_PASSWORD_PATTERN,
  type AuthUser,
} from '@auracle/shared';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { DJ_NAME } from '@/shared/lib/constants';
import { evalMode } from '@/shared/lib/evalMode';
import { login, register, signInWithGoogle, signInWithSpotify } from './authApi';
import { RateLimitError } from './authRateLimit';
import styles from './LandingPage.module.css';

gsap.registerPlugin(useGSAP);

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
  const rootRef = useRef<HTMLDivElement>(null);
  const transitionTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const [view, setView] = useState<View>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState<string | undefined>();
  const [authNotice, setAuthNotice] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrandTransitioning, setIsBrandTransitioning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | undefined>();
  const [now, setNow] = useState(() => Date.now());

  const isRateLimited = rateLimitedUntil !== undefined && now < rateLimitedUntil;

  useEffect(() => {
    if (rateLimitedUntil === undefined) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (rateLimitedUntil !== undefined && now >= rateLimitedUntil) {
      setRateLimitedUntil(undefined);
      setAuthError(undefined);
    }
  }, [now, rateLimitedUntil]);

  useEffect(() => {
    return () => {
      transitionTimelineRef.current?.kill();
    };
  }, []);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      if (view === 'landing') {
        const heroCopyItems = gsap.utils.toArray<HTMLElement>([
          `.${styles.copy} h1 span`,
          `.${styles.lede}`,
          `.${styles.actions}`,
          `.${styles.metrics}`,
        ]);
        const dnaWords = gsap.utils.toArray<HTMLElement>(`.${styles.dnaWordList} span`);

        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .fromTo(
            `.${styles.landingBrand}`,
            { autoAlpha: 0, y: -14, scale: 0.94 },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 },
            0,
          )
          .fromTo(
            heroCopyItems,
            { autoAlpha: 0, y: 34 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.72,
              stagger: 0.08,
              clearProps: 'opacity,visibility,transform',
            },
            0.08,
          )
          .fromTo(
            `.${styles.albumStack}`,
            { autoAlpha: 0, x: 70, rotate: -10, scale: 0.86 },
            {
              autoAlpha: 1,
              x: 0,
              rotate: 0,
              scale: 1,
              duration: 1.05,
              ease: 'expo.out',
              clearProps: 'opacity,visibility,transform',
            },
            0.18,
          )
          .from(
            dnaWords,
            {
              autoAlpha: 0,
              y: 28,
              duration: 0.9,
              stagger: 0.16,
              clearProps: 'opacity,visibility,transform',
            },
            0.56,
          );
        return;
      }

      if (view !== 'login') return;

      gsap.fromTo(
        [`.${styles.loginIntro}`, `.${styles.loginCard}`],
        { autoAlpha: 0, y: 24, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.62,
          ease: 'power3.out',
          stagger: 0.08,
          clearProps: 'opacity,visibility,transform',
        },
      );
    },
    { scope: rootRef, dependencies: [view] },
  );

  function switchAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setAuthError(undefined);
    setAuthNotice(undefined);
    setShowPassword(false);
  }

  function runBrandTransition(onComplete: () => void) {
    if (isBrandTransitioning) return;
    transitionTimelineRef.current?.kill();

    const root = rootRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reduceMotion) {
      setIsBrandTransitioning(true);
      onComplete();
      setIsBrandTransitioning(false);
      return;
    }

    const copy = root.querySelector(`.${styles.copy}`);
    const showcase = root.querySelector(`.${styles.playerShowcase}`);
    const guide = root.querySelector(`.${styles.productGuide}`);
    const landingBrand = root.querySelector(`.${styles.landingBrand}`);
    const ghostButton = root.querySelector(`.${styles.ghostButton}`);
    const targets = [copy, showcase, guide, landingBrand, ghostButton].filter(Boolean);

    setIsBrandTransitioning(true);
    transitionTimelineRef.current = gsap
      .timeline({
        defaults: { ease: 'power3.inOut' },
        onComplete: () => {
          onComplete();
          setIsBrandTransitioning(false);
        },
      })
      .to(copy, { autoAlpha: 0, y: -28, scale: 0.97, duration: 0.34 }, 0)
      .to(showcase, { autoAlpha: 0, y: 34, rotateX: -6, scale: 0.965, duration: 0.38 }, 0.03)
      .to(guide, { autoAlpha: 0, y: 18, duration: 0.24 }, 0)
      .to(landingBrand, { autoAlpha: 0, y: -8, scale: 0.96, duration: 0.22 }, 0.06)
      .to(ghostButton, { autoAlpha: 0.35, y: -4, duration: 0.22 }, 0.08)
      .set(targets, { clearProps: 'opacity,visibility,transform' });
  }

  function returnToLanding() {
    transitionTimelineRef.current?.kill();
    setView('landing');
    setIsBrandTransitioning(false);
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

  function handleAuthError(err: unknown) {
    if (err instanceof RateLimitError) {
      console.warn('[ui] rate-limited auth attempt, retry after', err.retryAfterMs, 'ms');
      setRateLimitedUntil(Date.now() + err.retryAfterMs);
      setNow(Date.now());
      return;
    }
    const error = err as Error & { code?: string; status?: number };
    console.error('[ui] auth error:', error.code ? `code=${error.code}` : '', error.status ? `status=${error.status}` : '', error.message);
    setAuthError(error.message);
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

    if (authMode === 'register' && !REGISTER_PASSWORD_PATTERN.test(password)) {
      setAuthError(REGISTER_PASSWORD_HINT);
      return;
    }

    setIsSubmitting(true);
    try {
      const response =
        authMode === 'register'
          ? await register({ email, password, name }, remember)
          : await login({ email, password }, remember);
      enterApp(response.user);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSpotifyLogin() {
    setAuthError(undefined);
    setAuthNotice(undefined);
    setIsSubmitting(true);
    try {
      await signInWithSpotify();
    } catch (err) {
      handleAuthError(err);
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setAuthError(undefined);
    setAuthNotice(undefined);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      handleAuthError(err);
      setIsSubmitting(false);
    }
  }

  return (
    <div ref={rootRef} className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          {view === 'login' || isBrandTransitioning ? (
            <button
              className={styles.brand}
              type="button"
              onClick={returnToLanding}
              disabled={isBrandTransitioning}
            >
              <svg className={styles.brandMark} viewBox="0 0 36 36" aria-hidden focusable="false">
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
            </button>
          ) : (
            <div className={styles.landingBrand} aria-label={DJ_NAME}>
              <svg className={styles.brandMark} viewBox="0 0 36 36" aria-hidden focusable="false">
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
            </div>
          )}
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
          <>
            <main className={styles.hero}>
              <section className={styles.copy} aria-labelledby="landing-title">
                <h1 id="landing-title">
                  <span>Your Music</span>
                  <span>
                    Has a <em>DNA.</em>
                  </span>
                </h1>
                <p className={styles.lede}>
                  Spotify liked tracks and the Auracle catalog become a personal Taste DNA, then turn
                  into an AI-hosted radio session for whatever you're doing today.
                </p>
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => showAuth('register')}
                    disabled={isBrandTransitioning}
                  >
                    Discover My DNA
                  </button>
                </div>
                <div className={styles.metrics} aria-label="Taste DNA preview stats">
                  <span>
                    <strong>Years of listening</strong>
                  </span>
                  <span>
                    <strong>Songs you loved</strong>
                  </span>
                  <span>
                    <strong>Artists you return to</strong>
                  </span>
                </div>
              </section>

              <section className={styles.playerShowcase} aria-label="Taste DNA preview">
                <div className={styles.albumStack} aria-hidden>
                  <div className={styles.albumBack} />
                  <div className={styles.albumArt}>
                    <span />
                  </div>
                </div>
                <div
                  className={styles.dnaHeroCard}
                  aria-label="Taste DNA: Reflective. Nostalgic. Curious. After Dark."
                >
                  <div className={styles.dnaWordList} aria-hidden>
                    {['Reflective.', 'Nostalgic.', 'Curious.', 'After Dark.'].map((word, index) => (
                      <span key={word} style={{ '--dna-word-index': index } as CSSProperties}>
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            </main>

            <section id="how" className={styles.productGuide} aria-labelledby="guide-title">
              <div className={styles.historyFlow} aria-labelledby="guide-title">
                <h2 id="guide-title">Every session starts here.</h2>
                <div className={styles.flowSteps}>
                  <article>
                    <span>History</span>
                  </article>
                  <article>
                    <span>DNA</span>
                  </article>
                  <article>
                    <span>Moment</span>
                  </article>
                  <article>
                    <span>Session</span>
                  </article>
                </div>
              </div>

              <div className={styles.exampleSession} aria-label="Example AI radio session">
                <section className={styles.sessionCopy}>
                  <p className={styles.eyebrow}>Example session</p>
                  <h2>
                    Writing. Focused.
                    <span>Medium energy.</span>
                  </h2>
                  <p>Generated from your Taste DNA.</p>
                  <button className={styles.listenLink} type="button" onClick={() => enterApp(guestUser)}>
                    Preview session
                    <span aria-hidden>→</span>
                  </button>
                </section>

                <section className={styles.sessionPlayer} aria-label="AI DJ example">
                  <p className={styles.status}>Now playing</p>
                  <h3>Midnight Signal</h3>
                  <p>Welcome back.</p>
                  <div className={styles.sessionPlayback}>
                    <button type="button" onClick={() => enterApp(guestUser)} aria-label="Play example session">
                      ▶
                    </button>
                    <div className={styles.waveform} aria-hidden>
                      {Array.from({ length: 34 }, (_, index) => (
                        <span
                          key={index}
                          style={{ '--level': `${18 + ((index * 13) % 58)}%` } as CSSProperties}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              <section className={styles.finalCta} aria-label="Start your AI radio">
                <div>
                  <h2>
                    Every station
                    <span>finds a direction.</span>
                    <span>Yours is waiting.</span>
                  </h2>
                  <p>
                    Connect Spotify or start from the local catalog. Auracle will shape the next station around your taste.
                  </p>
                </div>
                <div className={styles.ctaVisual} aria-hidden>
                  <i />
                </div>
                <button className={styles.primaryButton} type="button" onClick={() => showAuth('register')}>
                  Discover My DNA
                </button>
              </section>
            </section>
          </>
        ) : (
          <main className={styles.loginStage}>
            <section className={styles.loginIntro} aria-labelledby="login-title">
              <p className={styles.eyebrow}>Welcome back</p>
              <h1 id="login-title">
                {authMode === 'register' ? 'Create your listening space.' : 'Tune in where you left off.'}
              </h1>
              <p>
                Save your listening history, tune your sound profile, and return to a personal radio room
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
              <div className={styles.oauthGrid} aria-label="Social login options">
                <button
                  className={styles.oauthButton}
                  type="button"
                  aria-label="Continue with Google"
                  onClick={() => void handleGoogleLogin()}
                  disabled={isSubmitting || isRateLimited}
                >
                  <span className={styles.googleMark} aria-hidden>
                    <GoogleIcon />
                  </span>
                </button>
                <button
                  className={styles.oauthButton}
                  type="button"
                  aria-label="Continue with Spotify"
                  onClick={() => void handleSpotifyLogin()}
                  disabled={isSubmitting || isRateLimited}
                >
                  <span className={styles.spotifyMark} aria-hidden>
                    <SpotifyIcon />
                  </span>
                </button>
              </div>
              <div className={styles.formDivider}>or continue with email</div>
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
                <div className={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Password"
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    required
                    minLength={authMode === 'register' ? 8 : 6}
                    maxLength={authMode === 'register' ? 32 : undefined}
                    pattern={authMode === 'register' ? REGISTER_PASSWORD_PATTERN.source : undefined}
                    aria-describedby={authMode === 'register' ? 'password-hint' : undefined}
                  />
                  <button
                    className={styles.passwordToggle}
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                {authMode === 'register' ? (
                  <p id="password-hint" className={styles.passwordHint}>
                    {REGISTER_PASSWORD_HINT}
                  </p>
                ) : null}
              </label>
              {isRateLimited ? (
                <p className={styles.errorText} role="alert">
                  Too many attempts. Please wait {Math.max(1, Math.ceil((rateLimitedUntil! - now) / 1000))}s before trying again.
                </p>
              ) : authError ? (
                <p className={styles.errorText} role="alert">{authError}</p>
              ) : null}
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
              <button className={styles.primaryButton} type="submit" disabled={isSubmitting || isRateLimited}>
                {isSubmitting ? 'Checking...' : authMode === 'register' ? 'Create account' : 'Log in'}
              </button>
              {!evalMode ? (
              <button className={styles.secondaryButton} type="button" onClick={() => onEnterApp(guestUser)}>
                Continue as guest
              </button>
              ) : null}
            </form>
          </main>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95L6.2 33.08C9.51 39.56 16.23 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.08 5.57l6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  );
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path
        fill="#1ED760"
        d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0z"
      />
      <path
        fill="#121212"
        d="M17.52 17.34a.75.75 0 0 1-1.03.25c-2.83-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.33-1.46c4.6-1.05 8.54-.6 11.7 1.33.35.21.47.68.25 1.04zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.18-2.57-12.01-1.41a.94.94 0 1 1-.54-1.8c4.38-1.33 9.82-.68 13.53 1.6.44.27.58.85.31 1.3zm.13-3.4C15.23 8.36 8.82 8.15 5.09 9.28a1.13 1.13 0 0 1-.65-2.16c4.29-1.3 11.35-1.06 15.82 1.59a1.13 1.13 0 1 1-1.14 1.96z"
      />
    </svg>
  );
}
