import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getCurrentUser, wallets, transactions } from "@/lib/user";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount = body.amount;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (amount < 100) {
    return NextResponse.json({ error: "Minimum withdrawal: 100 tokens ($1.00)" }, { status: 400 });
  }

  // Check balance
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  if (!wallet || wallet.available < amount) {
    return NextResponse.json({ error: `Insufficient balance. Available: ${wallet?.available ?? 0}` }, { status: 400 });
  }

  // Mock withdrawal — in production this triggers a USDC transfer
  await db.update(wallets)
    .set({ available: sql`${wallets.available} - ${amount}`, updatedAt: new Date() })
    .where(eq(wallets.userId, user.id));

  await db.insert(transactions).values({
    id: nanoid(),
    userId: user.id,
    type: "withdrawal",
    amount: -amount,
    wagerId: null,
    description: "Withdrawal via website (test)",
  });

  return NextResponse.json({
    message: `Withdrawn ${amount} tokens ($${(amount / 100).toFixed(2)}). In production, USDC would be sent to your wallet.`,
  });
}
