import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const GAMES = [
  { name: "EA FC 25", key: "fifa", color: "#1a472a" },
  { name: "League of Legends", key: "lol", color: "#0a1628" },
  { name: "Valorant", key: "valorant", color: "#53212b" },
  { name: "Rocket League", key: "rocketleague", color: "#0e3a6b" },
  { name: "Call of Duty", key: "cod", color: "#1a1a1a" },
  { name: "Fortnite", key: "fortnite", color: "#1a1a4e" },
  { name: "NBA 2K", key: "nba2k", color: "#1a3a6b" },
  { name: "Madden NFL", key: "madden", color: "#013369" },
  { name: "Mario Kart", key: "mariokart", color: "#4a0a0a" },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div style={{ background: "var(--bg)" }}>
      {/* Hero — video background */}
      <section style={{
        position: "relative", textAlign: "center", padding: "120px 20px 100px",
        overflow: "hidden", background: "var(--bg)",
      }}>
        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover", zIndex: 0, opacity: 0.6,
          }}
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          background: "linear-gradient(180deg, rgba(10,10,14,0.3) 0%, rgba(10,10,14,0.85) 100%)",
          zIndex: 1,
        }} />
        {/* Content */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <h1 style={{ fontSize: "56px", fontWeight: 800, lineHeight: 1.1, marginBottom: "16px", color: "var(--text)" }}>
            COMPETE ON<br />
            <span style={{ color: "var(--accent)" }}>MATCHPOINT</span>
          </h1>
          <p style={{
            color: "var(--text-muted-dark)", fontSize: "18px", maxWidth: "480px",
            margin: "0 auto 40px", lineHeight: 1.6,
          }}>
            Challenge anyone. Stake MP. Winner takes the pot.
            Free play available — no money needed to start.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://discord.gg/matchpoint" target="_blank" rel="noopener noreferrer" style={{
              background: "#5865F2", color: "white", padding: "14px 36px",
              borderRadius: "8px", fontSize: "15px", fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: "10px",
            }}>
              <svg width="20" height="15" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9056 44.6363 54.2778 44.9293 54.6528 45.2082C54.7815 45.304 54.7731 45.5041 54.6332 45.5858C52.8645 46.6197 51.0258 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.0368 50.6034 51.2542 52.5699 52.5765 54.435C52.6325 54.5139 52.7332 54.5477 52.8256 54.5195C58.6247 52.7249 64.5073 50.0174 70.5802 45.5576C70.6334 45.5182 70.667 45.459 70.6726 45.3942C72.1527 30.0791 68.1754 16.7757 60.1933 4.9823C60.1737 4.9429 60.1401 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
              </svg>
              Join Discord
            </a>
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" style={{
        background: "var(--bg)", padding: "60px 20px",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", textAlign: "center", color: "var(--text)" }}>
            Available Games
          </h2>
          <p style={{ color: "var(--text-muted-dark)", textAlign: "center", marginBottom: "36px" }}>
            Challenge opponents in your favorite titles
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {GAMES.map(game => (
              <div key={game.key} style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px", padding: "36px 24px", textAlign: "center",
                cursor: "pointer", position: "relative", overflow: "hidden",
                transition: "border-color 0.15s, transform 0.15s",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  background: `linear-gradient(135deg, ${game.color}44 0%, transparent 60%)`,
                  zIndex: 0,
                }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text)" }}>{game.name}</div>
                  <div style={{
                    color: "var(--accent)", fontSize: "11px", marginTop: "10px",
                    textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600,
                  }}>Play Now</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{
        background: "var(--bg)", padding: "60px 20px",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px", textAlign: "center", color: "var(--text)" }}>
            How It Works
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FeatureCard title="Right-Click to Challenge" desc="Right-click any player in Discord, pick a game, set your stake. No commands to memorize." />
            <FeatureCard title="Screenshot Verified" desc="Submit a screenshot of the final score after each match. AI reads it instantly and settles the wager." />
            <FeatureCard title="Reputation System" desc="Every player has a trust score. Higher rep unlocks higher stakes. Cheaters get permabanned." />
            <FeatureCard title="Free Play Mode" desc="Claim daily FP and compete risk-free. Build your reputation before wagering real MP." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        background: "var(--bg-card)", padding: "80px 20px", textAlign: "center",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "12px", color: "var(--text)" }}>
            Stop Scrolling, Start Playing
          </h2>
          <p style={{ color: "var(--text-muted-dark)", marginBottom: "28px", fontSize: "16px" }}>
            Create your account and claim 1,000 FP
          </p>
          <a href="/api/auth/signin" style={{
            background: "var(--accent)", color: "white", padding: "14px 36px",
            borderRadius: "8px", fontSize: "15px", fontWeight: 700, display: "inline-block",
          }}>Join Now</a>
        </div>
      </section>

      {/* Footer removed — handled by layout */}
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "12px", padding: "28px",
    }}>
      <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "var(--text)" }}>{title}</h3>
      <p style={{ color: "var(--text-muted-dark)", fontSize: "14px", lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}
