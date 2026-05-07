import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  wallets,
  transactions,
  withdrawals,
  userPaymentProfiles,
  deposits,
  wagers as wagersTable,
} from "@/lib/user";

// ── Config from env vars ──

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY ?? "";
const NOWPAYMENTS_API_URL =
  process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1";
const MIN_WITHDRAWAL_TOKENS = Number(
  process.env.MIN_WITHDRAWAL_TOKENS ?? "1000",
);
const WITHDRAWAL_FEE_TOKENS = Number(
  process.env.WITHDRAWAL_FEE_TOKENS ?? "50",
);
const MAX_DAILY_WITHDRAWALS = Number(
  process.env.MAX_DAILY_WITHDRAWALS ?? "3",
);

// ── Base58 regex for Solana addresses (32-44 chars, no 0/O/I/l) ──
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ── POST handler ──

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Check maintenance mode
  const maintenanceMode =
    process.env.MAINTENANCE_MODE === "true" ||
    process.env.MAINTENANCE_MODE === "1";
  if (maintenanceMode) {
    return NextResponse.json(
      {
        error:
          "System under maintenance. Deposits and withdrawals are temporarily paused",
      },
      { status: 503 },
    );
  }

  // Check crypto payments configured
  if (!NOWPAYMENTS_API_KEY) {
    return NextResponse.json(
      { error: "Crypto payments are not configured" },
      { status: 503 },
    );
  }

  // 1b. Check wagering requirement for bonus users
  const [bonusWallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, user.id));

  if (bonusWallet && bonusWallet.bonusClaimed === 1 && bonusWallet.bonusAmount > 0) {
    const wageringRequired = bonusWallet.bonusAmount * 5;
    if (bonusWallet.totalWagered < wageringRequired) {
      return NextResponse.json(
        {
          error: `Wagering requirement not met. You must wager ${wageringRequired} MP before withdrawing (wagered so far: ${bonusWallet.totalWagered}).`,
        },
        { status: 400 },
      );
    }

    // Extra check: bonus user must have won at least 1 match against a depositing user
    // This prevents the "5 accounts funneling to 1" attack entirely
    const wonWagers = await db
      .select()
      .from(wagersTable)
      .where(and(eq(wagersTable.winnerId, user.id), eq(wagersTable.status, "settled")));

    // Check if any opponent has ever made a real deposit
    let hasLegitWin = false;
    for (const w of wonWagers) {
      const opponentId = w.creatorId === user.id ? w.opponentId : w.creatorId;
      if (!opponentId) continue;
      const [opponentDeposit] = await db
        .select()
        .from(deposits)
        .where(and(eq(deposits.userId, opponentId), eq(deposits.credited, 1)));
      if (opponentDeposit) {
        hasLegitWin = true;
        break;
      }
    }

    // If they've never deposited themselves, they need at least one win vs a depositor
    const [userDeposit] = await db
      .select()
      .from(deposits)
      .where(and(eq(deposits.userId, user.id), eq(deposits.credited, 1)));

    if (!userDeposit && !hasLegitWin) {
      return NextResponse.json(
        {
          error: "Withdrawal requires at least one win against a player who has deposited, or making your own deposit first.",
        },
        { status: 400 },
      );
    }
  }

  // Parse request body
  let body: { amount?: number; destinationAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { amount, destinationAddress } = body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (!destinationAddress || typeof destinationAddress !== "string") {
    return NextResponse.json(
      { error: "Destination address is required" },
      { status: 400 },
    );
  }

  // 2. Validate minimum amount
  if (amount < MIN_WITHDRAWAL_TOKENS) {
    return NextResponse.json(
      {
        error: `Minimum withdrawal is ${MIN_WITHDRAWAL_TOKENS} MP ($${(MIN_WITHDRAWAL_TOKENS / 100).toFixed(2)})`,
      },
      { status: 400 },
    );
  }

  // 3. Validate Solana address format
  if (!BASE58_REGEX.test(destinationAddress)) {
    return NextResponse.json(
      { error: "Invalid Solana wallet address" },
      { status: 400 },
    );
  }

  // 4. Check daily withdrawal count
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

  const dailyCount = countResult?.count ?? 0;
  if (dailyCount >= MAX_DAILY_WITHDRAWALS) {
    return NextResponse.json(
      {
        error:
          "Daily withdrawal limit reached. Resets at midnight UTC",
      },
      { status: 400 },
    );
  }

  // 5. Check sufficient balance (amount + fee)
  const totalDeduction = amount + WITHDRAWAL_FEE_TOKENS;
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, user.id));

  if (!wallet || wallet.available < totalDeduction) {
    return NextResponse.json(
      {
        error: `Insufficient balance. Available: ${wallet?.available ?? 0}, need: ${totalDeduction}`,
      },
      { status: 400 },
    );
  }

  // 6. Deduct balance + fee from wallet
  await db
    .update(wallets)
    .set({
      available: sql`${wallets.available} - ${totalDeduction}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, user.id));

  // Log withdrawal transaction
  await db.insert(transactions).values({
    id: nanoid(),
    userId: user.id,
    type: "withdrawal",
    amount: -amount,
    wagerId: null,
    description: `Crypto withdrawal`,
  });

  // Log withdrawal fee transaction
  await db.insert(transactions).values({
    id: nanoid(),
    userId: user.id,
    type: "withdrawal_fee",
    amount: -WITHDRAWAL_FEE_TOKENS,
    wagerId: null,
    description: `Withdrawal fee`,
  });

  // 7. Create withdrawal record
  const withdrawalId = nanoid();
  const usdValue = (amount / 100).toFixed(2);

  await db.insert(withdrawals).values({
    id: withdrawalId,
    userId: user.id,
    tokenAmount: amount,
    withdrawalFee: WITHDRAWAL_FEE_TOKENS,
    usdValue,
    destinationAddress,
    status: "pending",
  });

  // 8. Call NOWPayments Payout API (requires JWT auth)
  let nowpaymentsPayoutId: string | null = null;
  try {
    // Get JWT token first
    const NOWPAYMENTS_EMAIL = process.env.NOWPAYMENTS_EMAIL ?? "";
    const NOWPAYMENTS_PASSWORD = process.env.NOWPAYMENTS_PASSWORD ?? "";

    const authRes = await fetch(`${NOWPAYMENTS_API_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: NOWPAYMENTS_EMAIL, password: NOWPAYMENTS_PASSWORD }),
    });

    if (!authRes.ok) {
      const authText = await authRes.text();
      console.error(`[Withdraw] NOWPayments auth failed (${authRes.status}): ${authText}`);
      throw new Error(`Auth failed: ${authRes.status}`);
    }

    const { token: jwtToken } = (await authRes.json()) as { token: string };

    // Now call payout with JWT + API key
    const res = await fetch(`${NOWPAYMENTS_API_URL}/payout`, {
      method: "POST",
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        withdrawals: [{
          address: destinationAddress,
          currency: "usdcsol",
          amount: parseFloat(usdValue),
        }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[Withdraw] NOWPayments payout failed (${res.status}): ${text}`,
      );
      throw new Error(`Payout API returned ${res.status}`);
    }

    const data = (await res.json()) as { id?: string | number };
    nowpaymentsPayoutId = data.id ? String(data.id) : null;

    // 9. On success: update to "processing"
    await db
      .update(withdrawals)
      .set({
        status: "processing",
        nowpaymentsPayoutId,
        updatedAt: new Date(),
      })
      .where(eq(withdrawals.id, withdrawalId));
  } catch (err) {
    console.error("[Withdraw] Payout API error:", err);

    // 10. On failure: update to "failed" and refund
    await db
      .update(withdrawals)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(withdrawals.id, withdrawalId));

    // Refund balance + fee
    await db
      .update(wallets)
      .set({
        available: sql`${wallets.available} + ${totalDeduction}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, user.id));

    // Log refund transaction
    await db.insert(transactions).values({
      id: nanoid(),
      userId: user.id,
      type: "wager_refund",
      amount: totalDeduction,
      wagerId: null,
      description: `Refund failed withdrawal ${withdrawalId}`,
    });

    return NextResponse.json(
      {
        status: "failed",
        withdrawalId,
        error: "Withdrawal failed. Your balance has been refunded.",
      },
      { status: 502 },
    );
  }

  // 11. Save/update withdrawal address in userPaymentProfiles
  try {
    const [profile] = await db
      .select()
      .from(userPaymentProfiles)
      .where(eq(userPaymentProfiles.userId, user.id));

    if (profile) {
      await db
        .update(userPaymentProfiles)
        .set({
          savedWithdrawalAddress: destinationAddress,
          updatedAt: new Date(),
        })
        .where(eq(userPaymentProfiles.userId, user.id));
    } else {
      await db.insert(userPaymentProfiles).values({
        id: nanoid(),
        userId: user.id,
        savedWithdrawalAddress: destinationAddress,
      });
    }
  } catch (err) {
    // Non-critical — log but don't fail the withdrawal
    console.error("[Withdraw] Failed to save withdrawal address:", err);
  }

  return NextResponse.json({
    status: "processing",
    withdrawalId,
    nowpaymentsPayoutId,
    tokenAmount: amount,
    withdrawalFee: WITHDRAWAL_FEE_TOKENS,
    usdValue,
    destinationAddress,
  });
}
