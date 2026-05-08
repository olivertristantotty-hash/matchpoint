"use client";

import { useEffect, useRef, useState } from "react";

const featureData = [
  {
    id: "escrow",
    label: "ESCROW PROTECTED",
    href: "/fair-play",
    heading: "YOUR FUNDS ARE SAFE",
    body: "Every wager is locked in escrow the moment both players ready up. Funds only release when the match is settled — no one can run off with the pot.",
    position: { top: "auto", bottom: "8rem", left: "2rem", right: "auto", transform: "none" } as React.CSSProperties,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "payouts",
    label: "INSTANT PAYOUTS",
    href: "/wallet",
    heading: "CASH OUT ANYTIME",
    body: "Withdraw your winnings directly to your Solana wallet as USDC. No waiting periods, no hidden fees — just fast crypto payouts.",
    position: { top: "50%", bottom: "auto", left: "50%", right: "auto", transform: "translate(-50%, -50%)" } as React.CSSProperties,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "matches",
    label: "HEAD-TO-HEAD",
    href: "/dashboard",
    heading: "PURE SKILL COMPETITION",
    body: "Challenge any player to a 1v1 match in your favorite game. Blind result reporting and moderator disputes keep every match fair.",
    position: { top: "6rem", bottom: "auto", left: "auto", right: "2rem", transform: "none" } as React.CSSProperties,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const introRef = useRef<HTMLVideoElement>(null);
  const heroRef = useRef<HTMLVideoElement>(null);

  // Check auth status client-side and redirect if logged in
  useEffect(() => {
    fetch("/api/auth/session").then(res => res.json()).then(data => {
      if (data?.user) window.location.href = "/dashboard";
    }).catch(() => {});
  }, []);

  // Only show intro on first visit (sessionStorage)
  useEffect(() => {
    const hasPlayed = sessionStorage.getItem("mp-intro-played");
    if (hasPlayed) {
      setShowIntro(false);
      document.body.classList.add("page-ready");
    } else {
      setShowIntro(true);
    }
  }, []);

  // Intro video logic — progress bar + first-load only
  useEffect(() => {
    if (!showIntro) return;
    const intro = introRef.current;
    if (!intro) {
      document.body.classList.add("page-ready");
      return;
    }

    const handleTimeUpdate = () => {
      if (intro.duration > 0) {
        setLoadProgress(Math.min((intro.currentTime / intro.duration) * 100, 100));
      }
    };

    const handleEnded = () => {
      setLoadProgress(100);
      sessionStorage.setItem("mp-intro-played", "1");
      intro.classList.add("intro-video--done");
      document.body.classList.add("page-ready");
      setTimeout(() => {
        setShowIntro(false);
      }, 700);
    };

    const handleError = () => {
      sessionStorage.setItem("mp-intro-played", "1");
      setShowIntro(false);
      document.body.classList.add("page-ready");
    };

    intro.addEventListener("timeupdate", handleTimeUpdate);
    intro.addEventListener("ended", handleEnded);
    intro.addEventListener("error", handleError);

    const source = intro.querySelector("source");
    if (source) {
      source.addEventListener("error", handleError);
    }

    return () => {
      intro.removeEventListener("timeupdate", handleTimeUpdate);
      intro.removeEventListener("ended", handleEnded);
      intro.removeEventListener("error", handleError);
    };
  }, [showIntro]);

  useEffect(() => {
    const video = heroRef.current;
    if (!video) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReducedMotion.matches) {
      video.pause();
    }

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) video.pause();
      else video.play();
    };

    prefersReducedMotion.addEventListener("change", handleChange);
    return () => prefersReducedMotion.removeEventListener("change", handleChange);
  }, []);

  // Close modals on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHowItWorks(false);
        setShowLogin(false);
        setShowGames(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const active = featureData.find(f => f.id === activeFeature) ?? null;

  return (
    <>
      {/* Intro video — only on first visit */}
      {showIntro && (
        <div className="intro-screen">
          <video ref={introRef} className="intro-video" autoPlay muted playsInline>
            <source src="/intro.mp4" type="video/mp4" />
          </video>
          <div className="intro-loader">
            <span className="intro-loader__text">MATCHPOINT</span>
            <div className="intro-loader__bar">
              <div className="intro-loader__fill" style={{ width: `${loadProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      <nav className="nav-bar" aria-label="Main navigation">
        <div className="nav-left">
          <button
            onClick={() => setShowHowItWorks(true)}
            className="nav-link"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            HOW IT WORKS
          </button>
          <button
            onClick={() => setShowGames(true)}
            className="nav-link"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            GAMES
          </button>
        </div>
        <h1 className="nav-brand">MATCHPOINT</h1>
        <div className="nav-right">
          <button
            onClick={() => setShowLogin(true)}
            className="nav-link nav-cta"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            LOGIN WITH DISCORD
          </button>
        </div>
      </nav>

      <section className="hero">
        <video ref={heroRef} className="hero__video" autoPlay muted loop playsInline>
          <source src="/hero-loop.mp4" type="video/mp4" />
        </video>
        <div className="hero__overlay" aria-hidden="true"></div>

        {/* Content card — moves to different positions per feature */}
        <div
          className={`content-card ${active ? "content-card--visible" : ""}`}
          style={active ? {
            position: "absolute",
            zIndex: 3,
            ...active.position,
          } : {
            position: "absolute",
            zIndex: 3,
            top: "50%",
            left: "2rem",
            transform: "translateY(-50%)",
          }}
        >
          <h2 className="content-card__heading">{active?.heading ?? ""}</h2>
          <p className="content-card__body">{active?.body ?? ""}</p>
          {active && (
            <a href={active.href} className="content-card__cta">
              Learn More →
            </a>
          )}
        </div>

        {/* Feature cards */}
        <div className="hero__features">
          {featureData.map((feature) => (
            <a
              key={feature.id}
              href={feature.href}
              className={`feature-card ${activeFeature === feature.id ? "feature-card--active" : ""}`}
              onMouseEnter={() => setActiveFeature(feature.id)}
              onMouseLeave={() => setActiveFeature(null)}
              onFocus={() => setActiveFeature(feature.id)}
              onBlur={() => setActiveFeature(null)}
            >
              <div className="feature-card__icon">{feature.icon}</div>
              <span className="feature-card__label">{feature.label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Thin footer strip with legal links */}
      <footer className="landing-footer">
        <div className="landing-footer__links">
          <a href="/terms" className="landing-footer__link">Terms</a>
          <span className="landing-footer__divider">·</span>
          <a href="/privacy" className="landing-footer__link">Privacy</a>
          <span className="landing-footer__divider">·</span>
          <a href="/fair-play" className="landing-footer__link">Fair Play</a>
          <span className="landing-footer__divider">·</span>
          <span className="landing-footer__copy">© 2026 MATCHPOINT</span>
        </div>
      </footer>

      {/* ═══ HOW IT WORKS MODAL ═══ */}
      {showHowItWorks && (
        <div className="modal-backdrop" onClick={() => setShowHowItWorks(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={() => setShowHowItWorks(false)} aria-label="Close">
              ✕
            </button>
            <h2 className="modal__title">HOW IT WORKS</h2>

            <div className="modal__steps">
              <div className="modal__step">
                <div className="modal__step-number">1</div>
                <div>
                  <h3 className="modal__step-title">Sign in with Discord</h3>
                  <p className="modal__step-body">Connect your Discord account to create your MATCHPOINT profile. Link your game accounts to get started.</p>
                </div>
              </div>
              <div className="modal__step">
                <div className="modal__step-number">2</div>
                <div>
                  <h3 className="modal__step-title">Challenge a Player</h3>
                  <p className="modal__step-body">Use the Discord bot to challenge any player to a 1v1 match. Choose your game, set the stake, and both players ready up.</p>
                </div>
              </div>
              <div className="modal__step">
                <div className="modal__step-number">3</div>
                <div>
                  <h3 className="modal__step-title">Funds Locked in Escrow</h3>
                  <p className="modal__step-body">Once both players confirm, stakes are locked in escrow. No one can withdraw until the match is settled.</p>
                </div>
              </div>
              <div className="modal__step">
                <div className="modal__step-number">4</div>
                <div>
                  <h3 className="modal__step-title">Play & Report</h3>
                  <p className="modal__step-body">Play your match, then both players independently report the result. If results match, the winner is paid instantly.</p>
                </div>
              </div>
              <div className="modal__step">
                <div className="modal__step-number">5</div>
                <div>
                  <h3 className="modal__step-title">Cash Out</h3>
                  <p className="modal__step-body">Withdraw your winnings as USDC to your Solana wallet anytime. Fast payouts, no hidden fees.</p>
                </div>
              </div>
            </div>

            <div className="modal__footer">
              <p className="modal__note">Disputes? Both players submit evidence. A moderator reviews and makes a final call.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LOGIN MODAL ═══ */}
      {showLogin && (
        <div className="modal-backdrop" onClick={() => setShowLogin(false)}>
          <div className="modal modal--login" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={() => setShowLogin(false)} aria-label="Close">
              ✕
            </button>

            <div className="login-modal__content">
              <svg className="login-modal__icon" width="48" height="48" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.504 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9056 44.6363 54.2778 44.9293 54.6528 45.2082C54.7815 45.304 54.7731 45.504 54.6332 45.5858C52.8645 46.6197 51.0258 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.0368 50.6034 51.2542 52.5699 52.5765 54.435C52.6325 54.5139 52.7332 54.5477 52.8256 54.5195C58.6247 52.7249 64.5073 50.0174 70.5802 45.5576C70.6334 45.5182 70.667 45.459 70.6726 45.3942C72.1527 30.0791 68.1754 16.7757 60.1933 4.9823C60.1737 4.9429 60.1401 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
              </svg>
              <h2 className="modal__title">LOGIN WITH DISCORD</h2>
              <p className="login-modal__desc">
                Sign in with your Discord account to access your dashboard, manage your wallet, and start competing.
              </p>
              <a href="/api/auth/signin" className="login-modal__btn">
                <svg width="20" height="15" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.504 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9056 44.6363 54.2778 44.9293 54.6528 45.2082C54.7815 45.304 54.7731 45.504 54.6332 45.5858C52.8645 46.6197 51.0258 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.0368 50.6034 51.2542 52.5699 52.5765 54.435C52.6325 54.5139 52.7332 54.5477 52.8256 54.5195C58.6247 52.7249 64.5073 50.0174 70.5802 45.5576C70.6334 45.5182 70.667 45.459 70.6726 45.3942C72.1527 30.0791 68.1754 16.7757 60.1933 4.9823C60.1737 4.9429 60.1401 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
                </svg>
                Continue with Discord
              </a>
              <p className="login-modal__fine">
                By signing in you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUPPORTED GAMES MODAL ═══ */}
      {showGames && (
        <div className="modal-backdrop" onClick={() => setShowGames(false)}>
          <div className="modal modal--games" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={() => setShowGames(false)} aria-label="Close">
              ✕
            </button>
            <h2 className="modal__title">SUPPORTED GAMES</h2>
            <p className="games-modal__desc">Challenge players in any of these titles. More games added regularly.</p>
            <div className="games-modal__grid">
              {[
                { name: "EA FC 25", img: "https://images.launchbox-app.com//f8f77ab3-ad09-4a92-89ed-36ea4a5f00fd.png" },
                { name: "Valorant", img: "https://images.launchbox-app.com//037010fc-f6bb-40ce-a5b0-03b52f410361.jpg" },
                { name: "League of Legends", img: "https://images.launchbox-app.com//87d3c9a2-b559-4e0a-a35b-2e646780358e.jpg" },
                { name: "Call of Duty", img: "https://images.launchbox-app.com//842b0857-8c29-4304-9d03-e9798ae26a33.jpg" },
                { name: "Fortnite", img: "https://images.launchbox-app.com//6764510b-425b-482b-9522-4eaf1936a5e3.png" },
                { name: "Rocket League", img: "https://images.launchbox-app.com//4d604fc8-c358-4118-ad12-44143c9e5047.jpg" },
                { name: "NBA 2K25", img: "https://images.launchbox-app.com//e0620e2c-c22b-4572-8a83-d76dda67be49.jpg" },
                { name: "Madden NFL 25", img: "https://images.launchbox-app.com//fc7550a4-5e63-4efd-b2d4-8b5a7d804dcc.jpg" },
                { name: "Mario Kart 8", img: "https://images.launchbox-app.com//ce8597d3-fc3a-4a0e-8e92-9af9533d8652.jpg" },
              ].map((game) => (
                <div key={game.name} className="games-modal__card">
                  <div className="games-modal__img-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={game.img}
                      alt={`${game.name} cover art`}
                      className="games-modal__img"
                    />
                  </div>
                  <span className="games-modal__name">{game.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
