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

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));

  const [paymentProfile] = await db
    .select()
    .from(userPaymentProfiles)
    .where(eq(userPaymentProfiles.userId, user.id));

  const depositAddress = paymentProfile?.nowpaymentsDepositAddress ?? null;
  const savedWithdrawalAddress = paymentProfile?.savedWithdrawalAddress ?? null;

  const recentDeposits = await db
    .select()
    .from(deposits)
    .where(eq(deposits.userId, user.id))
    .orderBy(desc(deposits.createdAt))
    .limit(10);

  const recentWithdrawals = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, user.id))
    .orderBy(desc(withdrawals.createdAt))
    .limit(10);

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

  const maintenanceMode =
    process.env.MAINTENANCE_MODE === "true" ||
    process.env.MAINTENANCE_MODE === "1";

  const recentTxns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(20);

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
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <h1 style={{
        fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.375rem",
        letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
      }}>
        Wallet
      </h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "2rem", fontSize: "0.875rem" }}>
        Manage your MP. 100 MP = $1.00 USD.
      </p>

      {/* Maintenance Banner */}
      {maintenanceMode && (
        <div style={{
          padding: "0.875rem 1.125rem", borderRadius: "var(--card-radius)", marginBottom: "1.25rem",
          background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.3)",
          color: "var(--yellow)", fontSize: "0.875rem", fontWeight: 500,
          backdropFilter: "blur(12px)",
        }}>
          ⚠ System under maintenance. Deposits and withdrawals are temporarily paused.
        </div>
      )}

      {/* Balance Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "2rem" }}>
        <GlassCard label="Available" value={`${wallet?.available ?? 0}`} sub={`≈ $${((wallet?.available ?? 0) / 100).toFixed(2)}`} color="var(--green)" />
        <GlassCard label="In Escrow" value={`${wallet?.escrowed ?? 0}`} sub="Locked in wagers" color="var(--accent)" />
        <GlassCard label="Total" value={`${(wallet?.available ?? 0) + (wallet?.escrowed ?? 0)}`} sub={`≈ $${(((wallet?.available ?? 0) + (wallet?.escrowed ?? 0)) / 100).toFixed(2)}`} color="var(--text)" />
      </div>

      {/* Wagering Requirement Progress */}
      {wallet && wallet.bonusClaimed === 1 && wallet.bonusAmount > 0 && (() => {
        const wageringRequired = wallet.bonusAmount * 5;
        const wagered = wallet.totalWagered;
        const met = wagered >= wageringRequired;
        const pct = Math.min(Math.round((wagered / wageringRequired) * 100), 100);
        return (
          <div style={{
            background: "var(--bg-card)", backdropFilter: "blur(var(--glass-blur))",
            border: `1px solid ${met ? "rgba(52, 211, 153, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
            borderRadius: "var(--card-radius)", padding: "1rem 1.125rem", marginBottom: "2rem",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{
                fontSize: "0.8rem", fontWeight: 600,
                color: met ? "var(--green)" : "var(--yellow)",
                letterSpacing: "0.05em",
              }}>
                {met ? "✅ Wagering requirement met" : "🎁 Welcome Bonus — Wagering Requirement"}
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {wagered} / {wageringRequired} MP
              </span>
            </div>
            <div style={{
              height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: "3px", width: `${pct}%`,
                background: met ? "var(--green)" : "var(--accent)",
                transition: "width 0.3s ease",
              }} />
            </div>
            {!met && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.375rem" }}>
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
        bonusClaimed={wallet?.bonusClaimed === 1}
      />

      {/* Transaction History */}
      <h2 style={{
        fontSize: "0.75rem", fontWeight: 600, marginTop: "2.5rem", marginBottom: "0.75rem",
        color: "var(--text-muted)", textTransform: "uppercase",
        letterSpacing: "var(--letter-spacing-wide)",
      }}>
        Transaction History
      </h2>
      {recentTxns.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {recentTxns.map((tx) => (
            <div key={tx.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg-card)", backdropFilter: "blur(12px)",
              border: "1px solid var(--border)",
              borderRadius: "var(--card-radius)", padding: "0.625rem 0.875rem",
              fontSize: "0.8rem",
            }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ color: typeColor(tx.type), fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.05em" }}>
                  {typeLabel(tx.type)}
                </span>
                {tx.description && (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{tx.description}</span>
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
      <div style={{ fontSize: "1.625rem", fontWeight: 800, color }}>{value}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.125rem" }}>{sub}</div>
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
