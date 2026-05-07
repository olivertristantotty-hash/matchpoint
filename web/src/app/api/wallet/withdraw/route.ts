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

  // 8. Skip NOWPayments payout API — queue for manual processing
  // Post to admin channel in Discord and stay as "pending"

  // Notify admin channel
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    if (DISCORD_TOKEN) {
      // Find the admin-withdrawals channel
      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
      });
      const guilds = (await guildsRes.json()) as any[];

      for (const guild of guilds) {
        const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
          headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
        });
        const channels = (await channelsRes.json()) as any[];
        const adminChannel = channels.find((c: any) => c.name === "admin-withdrawals" && c.type === 0);

        if (adminChannel) {
          await fetch(`https://discord.com/api/v10/channels/${adminChannel.id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: "💸 Withdrawal Request",
                color: 0xf39c12,
                fields: [
                  { name: "User", value: user.username ?? user.id, inline: true },
                  { name: "Amount", value: `${amount} MP ($${usdValue})`, inline: true },
                  { name: "Fee", value: `${WITHDRAWAL_FEE_TOKENS} MP`, inline: true },
                  { name: "Send To", value: `\`${destinationAddress}\``, inline: false },
                  { name: "Net USDC", value: `$${usdValue} USDC (Solana)`, inline: true },
                ],
                footer: { text: `ID: ${withdrawalId}` },
                timestamp: new Date().toISOString(),
              }],
              components: [{
                type: 1,
                components: [{
                  type: 2,
                  style: 3,
                  label: "Mark as Sent",
                  custom_id: `withdrawal_complete:${withdrawalId}`,
                  emoji: { name: "✅" },
                }],
              }],
            }),
          });
          break;
        }
      }
    }
  } catch (err) {
    console.error("[Withdraw] Failed to notify admin channel:", err);
  }

  // Save/update withdrawal address in userPaymentProfiles
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
    console.error("[Withdraw] Failed to save withdrawal address:", err);
  }

  return NextResponse.json({
    status: "pending",
    withdrawalId,
    tokenAmount: amount,
    withdrawalFee: WITHDRAWAL_FEE_TOKENS,
    usdValue,
    destinationAddress,
    message: "Withdrawal submitted. You'll receive your USDC within 24 hours.",
  });
}
