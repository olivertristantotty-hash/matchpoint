import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, users } from "../db/schema.js";

export interface FraudCheck {
  passed: boolean;
  reason?: string;
}

export class AntiFraudService {

  /** Run all fraud checks before a wager is created */
  async preWagerCheck(creatorId: string, opponentId: string, amount: number): Promise<FraudCheck> {
    const checks = await Promise.all([
      this.checkBanned(creatorId),
      this.checkBanned(opponentId),
      this.checkRateLimit(creatorId),
      this.checkCollusion(creatorId, opponentId),
    ]);

    const failed = checks.find(c => !c.passed);
    return failed ?? { passed: true };
  }

  /** Check if user is banned */
  private async checkBanned(userId: string): Promise<FraudCheck> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.banned) {
      return { passed: false, reason: "User is banned from wagering." };
    }
    return { passed: true };
  }

  /** Rate limit: max 20 wagers per hour per user */
  private async checkRateLimit(userId: string): Promise<FraudCheck> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(wagers)
      .where(and(
        eq(wagers.creatorId, userId),
        gte(wagers.createdAt, oneHourAgo),
      ));

    if (result.count >= 20) {
      return { passed: false, reason: "Rate limit: too many wagers in the last hour. Try again later." };
    }
    return { passed: true };
  }

  /**
   * Detect potential collusion:
   * If two users have wagered each other 10+ times in the last 24h
   * with alternating wins, flag it.
   */
  private async checkCollusion(user1: string, user2: string): Promise<FraudCheck> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentWagers = await db
      .select()
      .from(wagers)
      .where(and(
        eq(wagers.status, "settled"),
        gte(wagers.createdAt, oneDayAgo),
      ));

    // Filter to wagers between these two users
    const between = recentWagers.filter(w =>
      (w.creatorId === user1 && w.opponentId === user2) ||
      (w.creatorId === user2 && w.opponentId === user1)
    );

    if (between.length < 10) return { passed: true };

    // Check for alternating wins
    const wins = between.map(w => w.winnerId);
    let alternating = 0;
    for (let i = 1; i < wins.length; i++) {
      if (wins[i] !== wins[i - 1]) alternating++;
    }

    const alternatingRatio = alternating / (wins.length - 1);
    if (alternatingRatio > 0.8) {
      return {
        passed: false,
        reason: "Suspicious activity detected: possible collusion. Wager blocked.",
      };
    }

    return { passed: true };
  }
}

export const antiFraudService = new AntiFraudService();
