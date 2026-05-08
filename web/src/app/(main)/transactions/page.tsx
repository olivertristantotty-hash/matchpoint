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
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <h1 style={{
        fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.375rem",
        letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
      }}>
        Transaction History
      </h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "2rem", fontSize: "0.875rem" }}>
        Full ledger of all token movements.
      </p>

      {txns.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "100px 1fr 120px 90px",
            padding: "0.5rem 0.875rem", fontSize: "0.6rem", color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)", fontWeight: 600,
          }}>
            <div>Type</div>
            <div>Description</div>
            <div>Date</div>
            <div style={{ textAlign: "right" }}>Amount</div>
          </div>

          {txns.map(tx => (
            <div key={tx.id} style={{
              display: "grid", gridTemplateColumns: "100px 1fr 120px 90px",
              padding: "0.625rem 0.875rem",
              background: "var(--bg-card)", backdropFilter: "blur(12px)",
              border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
              fontSize: "0.8rem", alignItems: "center",
            }}>
              <div>
                <span style={{
                  color: typeColor(tx.type), fontWeight: 600, fontSize: "0.7rem",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                }}>
                  {typeLabel(tx.type)}
                </span>
              </div>
              <div style={{
                color: "var(--text-muted)", fontSize: "0.75rem",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {tx.description || "—"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                {tx.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" "}
                {tx.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{
                textAlign: "right", fontWeight: 700, fontFamily: "monospace", fontSize: "0.8rem",
                color: tx.amount > 0 ? "var(--green)" : tx.amount < 0 ? "var(--red)" : "var(--text-muted)",
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
    wager_refund: "var(--accent)", escrow_lock: "var(--yellow)",
  };
  return map[type] ?? "var(--text-muted)";
}
