import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@auracle/shared';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { DJ_NAME } from '@/shared/lib/constants';
import { evalMode } from '@/shared/lib/evalMode';
import { login, register } from './authApi';
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
                  Years of playlists and listening history become a personal Taste DNA, then turn into
                  an AI-hosted radio session for whatever you're doing today.
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
                    Every playlist
                    <span>tells a story.</span>
                    <span>Yours is waiting.</span>
                  </h2>
                  <p>
                    Import your music history. Auracle will uncover the Taste DNA behind years of listening.
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
