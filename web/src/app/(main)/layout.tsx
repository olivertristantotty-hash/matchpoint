import { auth } from "@/lib/auth";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <>
      <nav style={{
        position: "fixed", top: 0, width: "100%",
        height: "var(--nav-height)", zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 2rem",
        background: "rgba(10, 15, 40, 0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Left — Powered by NOWPayments */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <a
            href="https://nowpayments.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.7rem", color: "var(--text-muted)", textDecoration: "none",
              letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Powered by <span style={{ fontWeight: 700 }}>NOWPayments</span>
          </a>
        </div>

        {/* Center — Brand */}
        <a href="/" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none",
        }}>
          <span style={{
            fontSize: "1.25rem", fontWeight: 700, color: "var(--text)",
            letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
          }}>
            MATCHPOINT
          </span>
        </a>

        {/* Right — Nav links */}
        <div style={{
          flex: 1, display: "flex", gap: "1.5rem", alignItems: "center",
          justifyContent: "flex-end",
        }}>
          {isLoggedIn ? (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/wallet">Wallet</NavLink>
              <NavLink href="/activity">Activity</NavLink>
              <NavLink href="/transactions">History</NavLink>
              <a href="/api/auth/signout-direct" style={{
                color: "var(--text-muted)", fontWeight: 500,
                fontSize: "0.75rem", letterSpacing: "var(--letter-spacing-wide)",
                textTransform: "uppercase",
                padding: "0.5rem 1rem", borderRadius: "var(--card-radius)",
                border: "1px solid var(--border)", background: "transparent",
                transition: "border-color 0.2s ease, color 0.2s ease",
                textDecoration: "none",
              }}>Sign Out</a>
            </>
          ) : (
            <a href="/api/auth/signin/discord" style={{
              background: "var(--accent)", color: "white",
              padding: "0.5rem 1.25rem", borderRadius: "var(--card-radius)",
              fontSize: "0.75rem", fontWeight: 600, border: "none",
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
              textDecoration: "none",
            }}>
              <svg width="16" height="12" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.504 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9056 44.6363 54.2778 44.9293 54.6528 45.2082C54.7815 45.304 54.7731 45.504 54.6332 45.5858C52.8645 46.6197 51.0258 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.0368 50.6034 51.2542 52.5699 52.5765 54.435C52.6325 54.5139 52.7332 54.5477 52.8256 54.5195C58.6247 52.7249 64.5073 50.0174 70.5802 45.5576C70.6334 45.5182 70.667 45.459 70.6726 45.3942C72.1527 30.0791 68.1754 16.7757 60.1933 4.9823C60.1737 4.9429 60.1401 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
              </svg>
              Sign in with Discord
            </a>
          )}
        </div>
      </nav>

      <main style={{ paddingTop: "var(--nav-height)" }}>{children}</main>

      <footer style={{
        background: "rgba(10, 15, 40, 0.4)",
        borderTop: "1px solid var(--border)",
        padding: "1.5rem 2rem", textAlign: "center",
        display: "flex", justifyContent: "center", gap: "2rem",
      }}>
        <FooterLink href="/terms">Terms</FooterLink>
        <FooterLink href="/privacy">Privacy</FooterLink>
        <FooterLink href="/fair-play">Fair Play</FooterLink>
      </footer>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      color: "var(--text-muted-dark)", fontWeight: 500,
      fontSize: "0.75rem", letterSpacing: "var(--letter-spacing-wide)",
      textTransform: "uppercase", textDecoration: "none",
      transition: "color 0.2s ease",
    }}>
      {children}
    </a>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      color: "var(--text-muted)", fontSize: "0.75rem",
      letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
      textDecoration: "none", fontWeight: 500,
    }}>
      {children}
    </a>
  );
}
