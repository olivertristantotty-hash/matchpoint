import { NextResponse } from "next/server";
import { eq, or, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser, wagers } from "@/lib/user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userWagers = await db
    .select()
    .from(wagers)
    .where(or(eq(wagers.creatorId, user.id), eq(wagers.opponentId, user.id)))
    .orderBy(desc(wagers.createdAt))
    .limit(50);

  // Calculate stats
  const settled = userWagers.filter(w => w.status === "settled");
  const wins = settled.filter(w => w.winnerId === user.id).length;
  const losses = settled.length - wins;

  return NextResponse.json({
    wagers: userWagers,
    stats: {
      total: userWagers.length,
      wins,
      losses,
      winRate: settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0,
    },
  });
}
