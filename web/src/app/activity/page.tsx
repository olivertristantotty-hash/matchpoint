import { db } from "@/lib/db";
import { deposits, withdrawals, users } from "@/lib/user";
import { eq, desc, sql } from "drizzle-orm";

export const revalidate = 30; // refresh every 30 seconds

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
  // Fetch recent confirmed deposits
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

  // Fetch recent withdrawals (pending + completed)
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
    .orderBy(desc(withdrawals.createdAt))
    .limit(20);

  // Get all user IDs and fetch usernames
  const allUserIds = [
    ...recentDeposits.map(d => d.userId),
    ...recentWithdrawals.map(w => w.userId),
  ];
  const uniqueUserIds = [...new Set(allUserIds)];

  const userRecords = uniqueUserIds.length > 0
    ? await db.select({ id: users.id, username: users.username }).from(users).where(sql`${users.id} IN ${uniqueUserIds}`)
    : [];
  const userMap = Object.fromEntries(userRecords.map(u => [u.id, u.username]));

  // Combine and sort by date
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

  // Stats
  const totalDeposited = recentDeposits.reduce((sum, d) => sum + (d.tokenAmount ?? 0), 0);
  const totalWithdrawn = recentWithdrawals.filter(w => w.status === "completed").reduce((sum, w) => sum + Number(w.tokenAmount), 0);

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "6px" }}>Live Activity</h1>
      <p style={{ color: "var(--text-muted-dark)", marginBottom: "28px", fontSize: "14px" }}>
        Real-time deposits and withdrawals on MATCHPOINT.
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "28px" }}>
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "10px", padding: "16px",
        }}>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>Total Deposited (Recent)</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--green)" }}>{totalDeposited.toLocaleString()} MP</div>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>≈ ${(totalDeposited / 100).toFixed(2)}</div>
        </div>
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "10px", padding: "16px",
        }}>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px", fontWeight: 500, marginBottom: "4px" }}>Total Withdrawn (Recent)</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--accent)" }}>{totalWithdrawn.toLocaleString()} MP</div>
          <div style={{ color: "var(--text-muted-dark)", fontSize: "11px" }}>≈ ${(totalWithdrawn / 100).toFixed(2)}</div>
        </div>
      </div>

      {/* Activity Feed */}
      {activity.length === 0 ? (
        <p style={{ color: "var(--text-muted-dark)", fontSize: "13px" }}>No activity yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {activity.map((item, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto",
              gap: "12px", alignItems: "center",
              padding: "12px 14px", background: "var(--bg-card)",
              border: "1px solid var(--border)", borderRadius: "8px",
              fontSize: "13px",
            }}>
              {/* Icon */}
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: item.type === "deposit" ? "rgba(39, 174, 96, 0.15)" : "rgba(211, 84, 0, 0.15)",
                fontSize: "14px",
              }}>
                {item.type === "deposit" ? "↓" : "↑"}
              </div>

              {/* User + type */}
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)" }}>{item.username}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted-dark)" }}>
                  {item.type === "deposit" ? "Deposited" : "Withdrew"}
                  {" · "}
                  {timeAgo(item.createdAt)}
                </div>
              </div>

              {/* Status */}
              <div>
                <span style={{
                  padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                  fontWeight: 600, textTransform: "capitalize",
                  background: statusColor(item.status).bg,
                  color: statusColor(item.status).text,
                }}>
                  {item.status}
                </span>
              </div>

              {/* Amount */}
              <div style={{
                fontWeight: 700, fontFamily: "monospace", fontSize: "14px",
                color: item.type === "deposit" ? "var(--green)" : "var(--accent)",
                textAlign: "right", minWidth: "80px",
              }}>
                {item.type === "deposit" ? "+" : "-"}{item.amount.toLocaleString()} MP
                {item.txHash && (
                  <a
                    href={`https://solscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block", fontSize: "10px", color: "var(--text-muted-dark)",
                      fontWeight: 400, marginTop: "2px", fontFamily: "sans-serif",
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

      <div style={{ textAlign: "center", marginTop: "24px", color: "var(--text-muted-dark)", fontSize: "12px" }}>
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
    confirmed: { bg: "rgba(39, 174, 96, 0.15)", text: "var(--green)" },
    completed: { bg: "rgba(39, 174, 96, 0.15)", text: "var(--green)" },
    pending: { bg: "rgba(243, 156, 18, 0.15)", text: "var(--yellow)" },
    processing: { bg: "rgba(243, 156, 18, 0.15)", text: "var(--yellow)" },
    failed: { bg: "rgba(231, 76, 60, 0.15)", text: "var(--red)" },
  };
  return map[status] ?? { bg: "rgba(255,255,255,0.05)", text: "var(--text-muted-dark)" };
}
