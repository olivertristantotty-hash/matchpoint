import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MATCHPOINT",
  description: "Competitive gaming wagers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 40px", background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <a href="/" style={{
            display: "flex", alignItems: "center", gap: "10px",
            fontSize: "20px", fontWeight: 800, letterSpacing: "2px", color: "var(--text)",
          }}>
            <img src="/logo.png" alt="MATCHPOINT" style={{ height: "133px", marginTop: "-36px", marginBottom: "-36px" }} />
          </a>
          <div style={{ display: "flex", gap: "28px", alignItems: "center", fontSize: "14px" }}>
            <a href="/dashboard" style={{ color: "var(--text-muted-dark)", fontWeight: 500 }}>Dashboard</a>
            <a href="/wallet" style={{ color: "var(--text-muted-dark)", fontWeight: 500 }}>Wallet</a>
            <a href="/transactions" style={{ color: "var(--text-muted-dark)", fontWeight: 500 }}>History</a>
            <a href="/api/auth/signin" style={{
              background: "var(--accent)", color: "white", padding: "8px 18px",
              borderRadius: "6px", fontSize: "13px", fontWeight: 600, border: "none",
            }}>Sign in with Discord</a>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
