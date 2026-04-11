import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const GAMES = [
  { name: "EA FC 25", key: "fifa", color: "#1a472a" },
  { name: "League of Legends", key: "lol", color: "#0a1628" },
  { name: "Valorant", key: "valorant", color: "#53212b" },
  { name: "Rocket League", key: "rocketleague", color: "#0e3a6b" },
  { name: "Call of Duty", key: "cod", color: "#1a1a1a" },
  { name: "Fortnite", key: "fortnite", color: "#1a1a4e" },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div>
      {/* Hero — dark section */}
      <section style={{
        textAlign: "center", padding: "100px 20px 80px",
        background: "var(--bg)",
      }}>
        <h1 style={{ fontSize: "56px", fontWeight: 800, lineHeight: 1.1, marginBottom: "16px" }}>
          COMPETE ON<br />
          <span style={{ color: "var(--accent)" }}>MATCHPOINT</span>
        </h1>
        <p style={{
          color: "var(--text-muted-dark)", fontSize: "18px", maxWidth: "480px",
          margin: "0 auto 40px", lineHeight: 1.6,
        }}>
          Challenge anyone. Stake tokens. Winner takes the pot.
          Free play available — no money needed to start.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <a href="/api/auth/signin" style={{
            background: "var(--accent)", color: "white", padding: "14px 36px",
            borderRadius: "8px", fontSize: "15px", fontWeight: 700,
          }}>Start Playing</a>
          <a href="#games" style={{
            background: "transparent", color: "var(--text)", padding: "14px 36px",
            borderRadius: "8px", fontSize: "15px", fontWeight: 600,
            border: "1px solid var(--border)",
          }}>View Games</a>
        </div>
      </section>

      {/* Games — white section */}
      <section id="games" style={{
        background: "var(--bg-surface)", padding: "60px 20px",
      }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", textAlign: "center", color: "var(--text-dark)" }}>
            Available Games
          </h2>
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: "36px" }}>
            Challenge opponents in your favorite titles
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {GAMES.map(game => (
              <div key={game.key} style={{
                background: `linear-gradient(135deg, ${game.color} 0%, #0A0A0E 100%)`,
                borderRadius: "14px", padding: "40px 24px", textAlign: "center",
                cursor: "pointer", position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: "18px", color: "white" }}>{game.name}</div>
                  <div style={{
                    color: "var(--accent)", fontSize: "12px", marginTop: "10px",
                    textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600,
                  }}>Play Now</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — dark section */}
      <section style={{ background: "var(--bg)", padding: "60px 20px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <FeatureCard icon="⚔️" title="Right-Click to Challenge" desc="Right-click any player in Discord, pick a game, set your stake. No commands to memorize." />
            <FeatureCard icon="🤖" title="Automated Tracking" desc="For supported games, results are pulled from game APIs automatically. No screenshots needed." />
            <FeatureCard icon="⭐" title="Reputation System" desc="Every player has a trust score. Higher rep unlocks higher stakes. Cheaters get permabanned." />
            <FeatureCard icon="🎮" title="Free Play Mode" desc="Claim daily coins and compete risk-free. Build your reputation before wagering real tokens." />
          </div>
        </div>
      </section>

      {/* CTA — white section */}
      <section style={{ background: "var(--bg-surface)", padding: "80px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "12px", color: "var(--text-dark)" }}>
            Stop Scrolling, Start Playing
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "28px", fontSize: "16px" }}>
            Create your account and claim 1,000 free coins
          </p>
          <a href="/api/auth/signin" style={{
            background: "var(--accent)", color: "white", padding: "14px 36px",
            borderRadius: "8px", fontSize: "15px", fontWeight: 700, display: "inline-block",
          }}>Join Now</a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "32px 40px", textAlign: "center",
        color: "var(--text-muted-dark)", fontSize: "13px",
      }}>
        MATCHPOINT © 2026. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "14px", padding: "28px",
    }}>
      <div style={{ fontSize: "28px", marginBottom: "12px" }}>{icon}</div>
      <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "var(--text)" }}>{title}</h3>
      <p style={{ color: "var(--text-muted-dark)", fontSize: "14px", lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}
