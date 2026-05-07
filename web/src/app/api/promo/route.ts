import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getCurrentUser, wallets, transactions } from "@/lib/user";

const PROMO_CODE = "FIRST20MAY";
const BONUS_AMOUNT = 500; // 500 MP = $5.00
const MAX_REDEMPTIONS = 20;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
  }

  // Validate code
  if (code.toUpperCase().trim() !== PROMO_CODE) {
    return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
  }

  // Check if user already claimed
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found. Use the Discord bot first." }, { status: 400 });
  }

  if (wallet.bonusClaimed === 1) {
    return NextResponse.json({ error: "You've already redeemed a promo code" }, { status: 400 });
  }

  // Check total redemptions
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wallets)
    .where(eq(wallets.bonusClaimed, 1));

  if (count >= MAX_REDEMPTIONS) {
    return NextResponse.json({ error: "This promo code has reached its limit. No more redemptions available." }, { status: 400 });
  }

  // Credit the bonus
  await db.update(wallets)
    .set({
      available: sql`${wallets.available} + ${BONUS_AMOUNT}`,
      bonusClaimed: 1,
      bonusAmount: BONUS_AMOUNT,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, user.id));

  // Log transaction
  await db.insert(transactions).values({
    id: nanoid(),
    userId: user.id,
    type: "deposit",
    amount: BONUS_AMOUNT,
    wagerId: null,
    description: `Promo code: ${PROMO_CODE}`,
  });

  return NextResponse.json({
    success: true,
    amount: BONUS_AMOUNT,
    message: `${BONUS_AMOUNT} MP ($${(BONUS_AMOUNT / 100).toFixed(2)}) credited to your wallet!`,
  });
}
