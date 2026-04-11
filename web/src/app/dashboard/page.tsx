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
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "80px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "22px", marginBottom: "10px" }}>Account Not Found</h2>
        <p style={{ color: "var(--text-muted-dark)" }}>
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
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>{user.username}</h1>
          <p style={{ color: "var(--text-muted-dark)", fontSize: "13px" }}>
            {repTier} · {user.reputation} rep · Max wager: {maxWager > 0 ? `${maxWager} tokens` : "Freeplay only"}
          </p>
        </div>
        <a href="/wallet" style={{
          background: "var(--accent)", color: "white", padding: "9px 18px",
          borderRadius: "6px", fontSize: "13px", fontWeight: 600,
        }}>Deposit / Withdraw</a>
      </div>

      {/* Balance Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "28px" }}>
        <Card label="Available" value={`${wallet?.available ?? 0}`} sub={`≈ $${((wallet?.available ?? 0) / 100).toFixed(2)}`} color="var(--green)" />
        <Card label="Escrowed" value={`${wallet?.escrowed ?? 0}`} sub="In wagers" color="var(--accent)" />
        <Card label="Free Coins" value={`${wallet?.freeplay ?? 0}`} sub="Freeplay" color="var(--accent-hover)" />
        <Card label="Win Rate" value={settled.length > 0 ? `${Math.round((wins / settled.length) * 100)}%` : "—"} sub={`${wins}W / ${losses}L`} color="var(--text)" />
      </div>

      {/* Linked Accounts */}
      <Section title="Linked Accounts">
        {linked.length === 0 ? (
          <p style={{ color: "var(--text-muted-dark)", fontSize: "13px" }}>No accounts linked. Use /link in Discord.</p>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {linked.map(a => (
              <span key={a.id} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "6px", padding: "6px 12px", fontSize: "12px",
              }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{a.platform.toUpperCase()}</span>
                <span style={{ color: "var(--text-muted-dark)", marginLeft: "6px" }}>{a.platformUsername}</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Recent Wagers */}
      <Section title="Recent Wagers">
        {recentWagers.length === 0 ? (
          <p style={{ color: "var(--text-muted-dark)", fontSize: "13px" }}>No wagers yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
    <div style={{ marginBottom: "28px" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "10px", color: "var(--text-muted-dark)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</h2>
      {children}
    </div>
  );
}

function Card({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "10px", padding: "14px 16px",
    }}>
      <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, color }}>{value}</div>
      <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", marginTop: "2px" }}>{sub}</div>
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
    pending: "var(--text-muted-dark)", disputed: "var(--red)",
    cancelled: "var(--text-muted-dark)", expired: "var(--text-muted-dark)", reporting: "var(--accent)",
  };

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
    }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {isFreeplay && <span style={{ fontSize: "10px", background: "var(--border)", padding: "2px 6px", borderRadius: "4px", color: "var(--accent-hover)" }}>FREE</span>}
        <span style={{ fontWeight: 600 }}>{wager.game.toUpperCase()}</span>
        <span style={{ color: "var(--text-muted-dark)" }}>{wager.amount} {isFreeplay ? "coins" : "tokens"}</span>
      </div>
      <span style={{ color: statusColor[wager.status] ?? "var(--text-muted-dark)", fontWeight: 600, fontSize: "12px" }}>
        {statusLabel[wager.status] ?? wager.status}
      </span>
    </div>
  );
}
