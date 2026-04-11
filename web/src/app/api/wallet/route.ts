import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser, wallets } from "@/lib/user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));

  if (!wallet) {
    return NextResponse.json({ available: 0, escrowed: 0 });
  }

  return NextResponse.json({
    available: wallet.available,
    escrowed: wallet.escrowed,
    total: wallet.available + wallet.escrowed,
  });
}
