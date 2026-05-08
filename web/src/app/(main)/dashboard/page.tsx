import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCurrentUser, wallets, wagers, gameAccounts } from "@/lib/user";
import { eq, or, desc } from "drizzle-orm";
import { db } from "@/lib/db";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "120px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem", letterSpacing: "var(--letter-spacing-wide)" }}>
          ACCOUNT NOT FOUND
        </h2>
        <p style={{ color: "var(--text-muted-dark)", fontSize: "0.9rem" }}>
          Use the Discord bot first to create your account, then come back here.
        </p>
      </div>
    );
  }

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const linked = await db.select().from(gameAccounts).where(eq(gameAccounts.userId, user.id));
  const recentWagers = await db.select().from(wagers)
    .where(or(eq(wagers.creatorId, user.id), eq(wagers.opponentId, user.id)))
    .orderBy(desc(wagers.createdAt)).limit(10);

  const settled = recentWagers.filter(w => w.status === "settled");
  const wins = settled.filter(w => w.winnerId === user.id).length;
  const losses = settled.length - wins;

  const repTier = user.reputation >= 1000 ? "Legend" : user.reputation >= 500 ? "Elite" :
    user.reputation >= 300 ? "Veteran" : user.reputation >= 150 ? "Trusted" :
    user.reputation >= 100 ? "Good" : user.reputation >= 50 ? "Caution" : "Untrusted";

  const maxWager = user.reputation >= 1000 ? 10000 : user.reputation >= 500 ? 5000 :
    user.reputation >= 300 ? 2500 : user.reputation >= 150 ? 1000 :
    user.reputation >= 100 ? 500 : user.reputation >= 50 ? 250 : 0;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{
            fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem",
            letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
          }}>
            {user.username}
          </h1>
          <p style={{ color: "var(--text-muted-dark)", fontSize: "0.8rem", letterSpacing: "0.05em" }}>
            {repTier} · {user.reputation} rep · Max wager: {maxWager > 0 ? `${maxWager} MP` : "Freeplay only"}
          </p>
        </div>
        <a href="/wallet" style={{
          background: "var(--accent)", color: "white",
          padding: "0.6rem 1.25rem", borderRadius: "var(--card-radius)",
          fontSize: "0.75rem", fontWeight: 600,
          letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
          textDecoration: "none",
        }}>
          Deposit / Withdraw
        </a>
      </div>

      {/* Balance Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem", marginBottom: "2rem" }}>
        <GlassCard label="Available" value={`${wallet?.available ?? 0}`} sub={`≈ $${((wallet?.available ?? 0) / 100).toFixed(2)}`} color="var(--green)" />
        <GlassCard label="Escrowed" value={`${wallet?.escrowed ?? 0}`} sub="In wagers" color="var(--accent)" />
        <GlassCard label="FP" value={`${wallet?.freeplay ?? 0}`} sub="Freeplay" color="var(--accent-hover)" />
        <GlassCard label="Win Rate" value={settled.length > 0 ? `${Math.round((wins / settled.length) * 100)}%` : "—"} sub={`${wins}W / ${losses}L`} color="var(--text)" />
      </div>

      {/* Linked Accounts */}
      <Section title="Linked Accounts">
        {linked.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No accounts linked. Use /link in Discord.</p>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {linked.map(a => (
              <span key={a.id} style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: "var(--card-radius)", padding: "0.5rem 0.875rem",
                fontSize: "0.75rem", backdropFilter: "blur(12px)",
              }}>
                <span style={{ color: "var(--accent)", fontWeight: 600, letterSpacing: "0.05em" }}>
                  {a.platform.toUpperCase()}
                </span>
                <span style={{ color: "var(--text-muted-dark)", marginLeft: "0.5rem" }}>
                  {a.platformUsername}
                </span>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Recent Wagers */}
      <Section title="Recent Wagers">
        {recentWagers.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No wagers yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {recentWagers.map(w => (
              <WagerRow key={w.id} wager={w} userId={user.id} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2 style={{
        fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.75rem",
        color: "var(--text-muted)", textTransform: "uppercase",
        letterSpacing: "var(--letter-spacing-wide)",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function GlassCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      backdropFilter: "blur(var(--glass-blur))",
      WebkitBackdropFilter: "blur(var(--glass-blur))",
      border: "1px solid var(--border)",
      borderRadius: "var(--card-radius)",
      padding: "1rem 1.125rem",
    }}>
      <div style={{
        color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 500,
        marginBottom: "0.375rem", textTransform: "uppercase",
        letterSpacing: "var(--letter-spacing-wide)",
      }}>
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.125rem" }}>{sub}</div>
    </div>
  );
}

function WagerRow({ wager, userId }: { wager: any; userId: string }) {
  const isWin = wager.winnerId === userId;
  const isFreeplay = wager.mode === "freeplay";
  const statusLabel: Record<string, string> = {
    settled: isWin ? "Won" : "Lost", active: "Active", pending: "Pending",
    disputed: "Disputed", cancelled: "Cancelled", expired: "Expired", reporting: "Reporting",
  };
  const statusColor: Record<string, string> = {
    settled: isWin ? "var(--green)" : "var(--red)", active: "var(--accent)",
    pending: "var(--text-muted)", disputed: "var(--red)",
    cancelled: "var(--text-muted)", expired: "var(--text-muted)", reporting: "var(--accent)",
  };

  const gameCovers: Record<string, string> = {
    fifa: "https://images.launchbox-app.com//f8f77ab3-ad09-4a92-89ed-36ea4a5f00fd.png",
    valorant: "https://images.launchbox-app.com//037010fc-f6bb-40ce-a5b0-03b52f410361.jpg",
    lol: "https://images.launchbox-app.com//87d3c9a2-b559-4e0a-a35b-2e646780358e.jpg",
    cod: "https://images.launchbox-app.com//842b0857-8c29-4304-9d03-e9798ae26a33.jpg",
    fortnite: "https://images.launchbox-app.com//6764510b-425b-482b-9522-4eaf1936a5e3.png",
    rocketleague: "https://images.launchbox-app.com//4d604fc8-c358-4118-ad12-44143c9e5047.jpg",
    nba2k: "https://images.launchbox-app.com//e0620e2c-c22b-4572-8a83-d76dda67be49.jpg",
    madden: "https://images.launchbox-app.com//fc7550a4-5e63-4efd-b2d4-8b5a7d804dcc.jpg",
    mariokart: "https://images.launchbox-app.com//ce8597d3-fc3a-4a0e-8e92-9af9533d8652.jpg",
  };

  // Extract the base game key (e.g. "cod:Black Ops 2" → "cod")
  const gameKey = wager.game.split(":")[0].toLowerCase();
  const coverUrl = gameCovers[gameKey];

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "var(--bg-card)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--border)",
      borderRadius: "var(--card-radius)", padding: "0.75rem 1rem",
      fontSize: "0.8rem",
    }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
        {coverUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt={wager.game}
            style={{
              width: "24px", height: "32px", borderRadius: "4px",
              objectFit: "cover", flexShrink: 0,
            }}
          />
        )}
        {isFreeplay && (
          <span style={{
            fontSize: "0.6rem", background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            padding: "0.125rem 0.5rem", borderRadius: "6px",
            color: "var(--accent-hover)", fontWeight: 600,
            letterSpacing: "0.05em",
          }}>
            FREE
          </span>
        )}
        <span style={{ fontWeight: 600, letterSpacing: "0.05em" }}>{wager.game.toUpperCase()}</span>
        <span style={{ color: "var(--text-muted)" }}>{wager.amount} {isFreeplay ? "FP" : "MP"}</span>
      </div>
      <span style={{
        color: statusColor[wager.status] ?? "var(--text-muted)",
        fontWeight: 600, fontSize: "0.7rem",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {statusLabel[wager.status] ?? wager.status}
      </span>
    </div>
  );
}
