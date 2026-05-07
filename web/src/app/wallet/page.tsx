import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getCurrentUser,
  wallets,
  transactions,
  deposits,
  withdrawals,
  userPaymentProfiles,
} from "@/lib/user";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import WalletActions from "./actions";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  // Fetch wallet balance
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));

  // Fetch deposit address and saved withdrawal address
  const [paymentProfile] = await db
    .select()
    .from(userPaymentProfiles)
    .where(eq(userPaymentProfiles.userId, user.id));

  const depositAddress = paymentProfile?.nowpaymentsDepositAddress ?? null;
  const savedWithdrawalAddress = paymentProfile?.savedWithdrawalAddress ?? null;

  // Fetch recent deposits
  const recentDeposits = await db
    .select()
    .from(deposits)
    .where(eq(deposits.userId, user.id))
    .orderBy(desc(deposits.createdAt))
    .limit(10);

  // Fetch recent withdrawals
  const recentWithdrawals = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, user.id))
    .orderBy(desc(withdrawals.createdAt))
    .limit(10);

  // Daily withdrawal count
  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.userId, user.id),
        gte(withdrawals.createdAt, startOfDay),
      ),
    );
  const dailyWithdrawalCount = countResult?.count ?? 0;

  // Maintenance mode
  const maintenanceMode =
    process.env.MAINTENANCE_MODE === "true" ||
    process.env.MAINTENANCE_MODE === "1";

  // Fetch recent transactions for history
  const recentTxns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(20);

  // Serialize dates for client component
  const serializedDeposits = recentDeposits.map((d) => ({
    id: d.id,
    status: d.status,
    sourceCurrency: d.sourceCurrency,
    usdValue: d.usdValue,
    tokenAmount: d.tokenAmount,
    createdAt: d.createdAt.toISOString(),
  }));

  const serializedWithdrawals = recentWithdrawals.map((w) => ({
    id: w.id,
    status: w.status,
    tokenAmount: w.tokenAmount,
    withdrawalFee: w.withdrawalFee,
    usdValue: w.usdValue,
    destinationAddress: w.destinationAddress,
    createdAt: w.createdAt.toISOString(),
  }));

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "6px" }}>Wallet</h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "28px", fontSize: "14px" }}>
        Manage your MP. 100 MP = $1.00 USD.
      </p>

      {/* Maintenance Banner */}
      {maintenanceMode && (
        <div style={{
          padding: "14px 18px", borderRadius: "10px", marginBottom: "20px",
          background: "rgba(243, 156, 18, 0.1)", border: "1px solid var(--yellow)",
          color: "var(--yellow)", fontSize: "14px", fontWeight: 500,
        }}>
          ⚠ System under maintenance. Deposits and withdrawals are temporarily paused.
        </div>
      )}

      {/* Balance Cards */}
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

      {/* Wagering Requirement Progress */}
      {wallet && wallet.bonusClaimed === 1 && wallet.bonusAmount > 0 && (() => {
        const wageringRequired = wallet.bonusAmount * 5;
        const wagered = wallet.totalWagered;
        const met = wagered >= wageringRequired;
        const pct = Math.min(Math.round((wagered / wageringRequired) * 100), 100);
        return (
          <div style={{
            background: "var(--bg-card)", border: `1px solid ${met ? "var(--green)" : "var(--yellow)"}`,
            borderRadius: "10px", padding: "14px 18px", marginBottom: "28px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: met ? "var(--green)" : "var(--yellow)" }}>
                {met ? "✅ Wagering requirement met" : "🎁 Welcome Bonus — Wagering Requirement"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted-dark)" }}>
                {wagered} / {wageringRequired} MP
              </span>
            </div>
            <div style={{
              height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: "3px", width: `${pct}%`,
                background: met ? "var(--green)" : "var(--accent)",
                transition: "width 0.3s ease",
              }} />
            </div>
            {!met && (
              <div style={{ fontSize: "11px", color: "var(--text-muted-dark)", marginTop: "6px" }}>
                Wager {wageringRequired - wagered} more MP to unlock withdrawals.
              </div>
            )}
          </div>
        );
      })()}

      {/* Deposit / Withdrawal Actions */}
      <WalletActions
        depositAddress={depositAddress}
        savedWithdrawalAddress={savedWithdrawalAddress}
        dailyWithdrawalCount={dailyWithdrawalCount}
        balance={wallet?.available ?? 0}
        recentDeposits={serializedDeposits}
        recentWithdrawals={serializedWithdrawals}
        maintenanceMode={maintenanceMode}
      />

      {/* Transaction History */}
      <h2 style={{ fontSize: "18px", marginTop: "40px", marginBottom: "12px" }}>Transaction History</h2>
      {recentTxns.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {recentTxns.map((tx) => (
            <div key={tx.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
            }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: typeColor(tx.type), fontWeight: 600 }}>{typeLabel(tx.type)}</span>
                {tx.description && (
                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{tx.description}</span>
                )}
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
    deposit: "Deposit",
    deposit_credit: "Deposit",
    withdrawal: "Withdrawal",
    withdrawal_fee: "Withdrawal Fee",
    escrow_lock: "Escrow Lock",
    escrow_release: "Escrow Release",
    wager_win: "Winnings",
    wager_refund: "Refund",
    platform_fee: "Fee",
  };
  return map[type] ?? type;
}

function typeColor(type: string) {
  const map: Record<string, string> = {
    deposit: "var(--green)",
    deposit_credit: "var(--green)",
    withdrawal: "var(--red)",
    withdrawal_fee: "var(--red)",
    wager_win: "var(--green)",
    wager_refund: "var(--accent)",
    escrow_lock: "var(--yellow)",
    escrow_release: "var(--green)",
  };
  return map[type] ?? "var(--text-muted)";
}
