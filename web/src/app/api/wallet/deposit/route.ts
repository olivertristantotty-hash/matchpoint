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

  if (!amount || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: "Invalid amount (1 - 100,000)" }, { status: 400 });
  }

  // Mock deposit — in production this verifies a USDC payment first
  await db.update(wallets)
    .set({ available: sql`${wallets.available} + ${amount}`, updatedAt: new Date() })
    .where(eq(wallets.userId, user.id));

  await db.insert(transactions).values({
    id: nanoid(),
    userId: user.id,
    type: "deposit",
    amount,
    wagerId: null,
    description: "Deposit via website (test)",
  });

  return NextResponse.json({
    message: `Deposited ${amount} tokens ($${(amount / 100).toFixed(2)})`,
  });
}
