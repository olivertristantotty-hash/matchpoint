import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCurrentUser, transactions } from "@/lib/user";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";

export default async function Transactions() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const txns = await db.select().from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt)).limit(100);

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "6px" }}>Transaction History</h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "28px", fontSize: "14px" }}>
        Full ledger of all token movements.
      </p>

      {txns.length === 0 ? (
        <p style={{ color: "var(--text-muted-dark)", fontSize: "13px" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "100px 1fr 120px 90px",
            padding: "8px 14px", fontSize: "10px", color: "var(--text-muted-dark)",
            textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600,
          }}>
            <div>Type</div>
            <div>Description</div>
            <div>Date</div>
            <div style={{ textAlign: "right" }}>Amount</div>
          </div>

          {txns.map(tx => (
            <div key={tx.id} style={{
              display: "grid", gridTemplateColumns: "100px 1fr 120px 90px",
              padding: "10px 14px", background: "var(--bg-card)",
              border: "1px solid var(--border)", borderRadius: "8px",
              fontSize: "13px", alignItems: "center",
            }}>
              <div>
                <span style={{ color: typeColor(tx.type), fontWeight: 600, fontSize: "12px" }}>
                  {typeLabel(tx.type)}
                </span>
              </div>
              <div style={{ color: "var(--text-muted-dark)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tx.description || "—"}
              </div>
              <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>
                {tx.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" "}
                {tx.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{
                textAlign: "right", fontWeight: 700, fontFamily: "monospace", fontSize: "13px",
                color: tx.amount > 0 ? "var(--green)" : tx.amount < 0 ? "var(--red)" : "var(--text-muted-dark)",
              }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    deposit: "Deposit", deposit_credit: "Deposit", withdrawal: "Withdraw",
    withdrawal_fee: "Fee", escrow_lock: "Escrow",
    escrow_release: "Release", wager_win: "Winnings", wager_refund: "Refund", platform_fee: "Fee",
  };
  return map[type] ?? type;
}

function typeColor(type: string) {
  const map: Record<string, string> = {
    deposit: "var(--green)", deposit_credit: "var(--green)", withdrawal: "var(--red)",
    withdrawal_fee: "var(--red)", wager_win: "var(--green)",
    wager_refund: "var(--accent)", escrow_lock: "var(--accent)",
  };
  return map[type] ?? "var(--text-muted-dark)";
}
