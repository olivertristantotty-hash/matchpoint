import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCurrentUser, wallets, transactions } from "@/lib/user";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import WalletActions from "./actions";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const recentTxns = await db.select().from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt)).limit(20);

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "6px" }}>Wallet</h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "28px", fontSize: "14px" }}>
        Manage your real tokens. 100 tokens = $1.00 USD.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "28px" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "16px" }}>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>Available</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--green)" }}>{wallet?.available ?? 0}</div>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>≈ ${((wallet?.available ?? 0) / 100).toFixed(2)}</div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "16px" }}>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>In Escrow</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--accent)" }}>{wallet?.escrowed ?? 0}</div>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>Locked in wagers</div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "16px" }}>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>Total</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text)" }}>{(wallet?.available ?? 0) + (wallet?.escrowed ?? 0)}</div>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>≈ ${(((wallet?.available ?? 0) + (wallet?.escrowed ?? 0)) / 100).toFixed(2)}</div>
        </div>
      </div>

      <WalletActions available={wallet?.available ?? 0} />

      {/* Recent Transactions */}
      <h2 style={{ fontSize: "18px", marginTop: "40px", marginBottom: "12px" }}>Recent Transactions</h2>
      {recentTxns.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {recentTxns.map(tx => (
            <div key={tx.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
            }}>
              <div>
                <span style={{ color: typeColor(tx.type), fontWeight: 600 }}>{typeLabel(tx.type)}</span>
                {tx.description && <span style={{ color: "var(--text-muted)", marginLeft: "10px" }}>{tx.description}</span>}
              </div>
              <span style={{
                fontFamily: "monospace", fontWeight: 600,
                color: tx.amount > 0 ? "var(--green)" : tx.amount < 0 ? "var(--red)" : "var(--text-muted)",
              }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    deposit: "Deposit", withdrawal: "Withdrawal", escrow_lock: "Escrow Lock",
    escrow_release: "Escrow Release", wager_win: "Winnings", wager_refund: "Refund", platform_fee: "Fee",
  };
  return map[type] ?? type;
}

function typeColor(type: string) {
  const map: Record<string, string> = {
    deposit: "var(--green)", withdrawal: "var(--red)", wager_win: "var(--green)",
    wager_refund: "var(--accent)", escrow_lock: "var(--yellow)",
  };
  return map[type] ?? "var(--text-muted)";
}
