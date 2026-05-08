import { db } from "@/lib/db";
import { deposits, withdrawals, users } from "@/lib/user";
import { eq, desc, sql } from "drizzle-orm";

export const revalidate = 30;

interface ActivityItem {
  type: "deposit" | "withdrawal";
  username: string;
  amount: number;
  usdValue: string;
  status: string;
  createdAt: string;
  txHash: string | null;
}

export default async function ActivityPage() {
  const recentDeposits = await db
    .select({
      userId: deposits.userId,
      tokenAmount: deposits.tokenAmount,
      usdValue: deposits.usdValue,
      status: deposits.status,
      txHash: deposits.txHash,
      createdAt: deposits.createdAt,
    })
    .from(deposits)
    .where(eq(deposits.credited, 1))
    .orderBy(desc(deposits.createdAt))
    .limit(20);

  const recentWithdrawals = await db
    .select({
      userId: withdrawals.userId,
      tokenAmount: withdrawals.tokenAmount,
      usdValue: withdrawals.usdValue,
      status: withdrawals.status,
      txHash: withdrawals.txHash,
      createdAt: withdrawals.createdAt,
    })
    .from(withdrawals)
    .where(sql`${withdrawals.status} IN ('pending', 'processing', 'completed')`)
    .orderBy(desc(withdrawals.createdAt))
    .limit(20);

  const allUserIds = [
    ...recentDeposits.map(d => d.userId),
    ...recentWithdrawals.map(w => w.userId),
  ];
  const uniqueUserIds = [...new Set(allUserIds)];

  const userRecords = uniqueUserIds.length > 0
    ? await db.select({ id: users.id, username: users.username }).from(users).where(sql`${users.id} IN ${uniqueUserIds}`)
    : [];
  const userMap = Object.fromEntries(userRecords.map(u => [u.id, u.username]));

  const activity: ActivityItem[] = [
    ...recentDeposits.map(d => ({
      type: "deposit" as const,
      username: userMap[d.userId] ?? "Anonymous",
      amount: d.tokenAmount ?? 0,
      usdValue: d.usdValue ?? "0",
      status: "confirmed",
      createdAt: d.createdAt.toISOString(),
      txHash: d.txHash ?? null,
    })),
    ...recentWithdrawals.map(w => ({
      type: "withdrawal" as const,
      username: userMap[w.userId] ?? "Anonymous",
      amount: Number(w.tokenAmount),
      usdValue: w.usdValue,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      txHash: w.txHash ?? null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);

  const totalDeposited = recentDeposits.reduce((sum, d) => sum + (d.tokenAmount ?? 0), 0);
  const totalWithdrawn = recentWithdrawals.filter(w => w.status === "completed").reduce((sum, w) => sum + Number(w.tokenAmount), 0);

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <h1 style={{
        fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.375rem",
        letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
      }}>
        Live Activity
      </h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "2rem", fontSize: "0.875rem" }}>
        Real-time deposits and withdrawals on MATCHPOINT.
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "2rem" }}>
        <div style={{
          background: "var(--bg-card)", backdropFilter: "blur(var(--glass-blur))",
          border: "1px solid var(--border)", borderRadius: "var(--card-radius)", padding: "1rem 1.125rem",
        }}>
          <div style={{
            color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 500,
            marginBottom: "0.375rem", textTransform: "uppercase",
            letterSpacing: "var(--letter-spacing-wide)",
          }}>
            Total Deposited (Recent)
          </div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--green)" }}>{totalDeposited.toLocaleString()} MP</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>≈ ${(totalDeposited / 100).toFixed(2)}</div>
        </div>
        <div style={{
          background: "var(--bg-card)", backdropFilter: "blur(var(--glass-blur))",
          border: "1px solid var(--border)", borderRadius: "var(--card-radius)", padding: "1rem 1.125rem",
        }}>
          <div style={{
            color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 500,
            marginBottom: "0.375rem", textTransform: "uppercase",
            letterSpacing: "var(--letter-spacing-wide)",
          }}>
            Total Withdrawn (Recent)
          </div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--accent)" }}>{totalWithdrawn.toLocaleString()} MP</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>≈ ${(totalWithdrawn / 100).toFixed(2)}</div>
        </div>
      </div>

      {/* Activity Feed */}
      {activity.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No activity yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {activity.map((item, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto",
              gap: "0.75rem", alignItems: "center",
              padding: "0.75rem 0.875rem",
              background: "var(--bg-card)", backdropFilter: "blur(12px)",
              border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
              fontSize: "0.8rem",
            }}>
              {/* Icon */}
              <div style={{
                width: "2rem", height: "2rem", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: item.type === "deposit" ? "rgba(52, 211, 153, 0.12)" : "rgba(74, 158, 255, 0.12)",
                fontSize: "0.875rem", color: item.type === "deposit" ? "var(--green)" : "var(--accent)",
              }}>
                {item.type === "deposit" ? "↓" : "↑"}
              </div>

              {/* User + type */}
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.8rem" }}>{item.username}</div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                  {item.type === "deposit" ? "Deposited" : "Withdrew"}
                  {" · "}
                  {timeAgo(item.createdAt)}
                </div>
              </div>

              {/* Status */}
              <div>
                <span style={{
                  padding: "0.125rem 0.5rem", borderRadius: "6px", fontSize: "0.6rem",
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                  background: statusColor(item.status).bg,
                  color: statusColor(item.status).text,
                }}>
                  {item.status}
                </span>
              </div>

              {/* Amount */}
              <div style={{
                fontWeight: 700, fontFamily: "monospace", fontSize: "0.875rem",
                color: item.type === "deposit" ? "var(--green)" : "var(--accent)",
                textAlign: "right", minWidth: "5rem",
              }}>
                {item.type === "deposit" ? "+" : "-"}{item.amount.toLocaleString()} MP
                {item.txHash && (
                  <a
                    href={`https://solscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block", fontSize: "0.6rem", color: "var(--text-muted)",
                      fontWeight: 400, marginTop: "0.125rem", fontFamily: "sans-serif",
                      textDecoration: "none",
                    }}
                  >
                    View on Solscan ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        textAlign: "center", marginTop: "1.5rem", color: "var(--text-muted)",
        fontSize: "0.7rem", letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
      }}>
        Updates every 30 seconds
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function statusColor(status: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: "rgba(52, 211, 153, 0.12)", text: "var(--green)" },
    completed: { bg: "rgba(52, 211, 153, 0.12)", text: "var(--green)" },
    pending: { bg: "rgba(251, 191, 36, 0.12)", text: "var(--yellow)" },
    processing: { bg: "rgba(251, 191, 36, 0.12)", text: "var(--yellow)" },
    failed: { bg: "rgba(248, 113, 113, 0.12)", text: "var(--red)" },
  };
  return map[status] ?? { bg: "rgba(255,255,255,0.04)", text: "var(--text-muted)" };
}
