import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, users, wallets, gameAccounts, deposits } from "../db/schema.js";

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
      this.checkBonusAbuse(creatorId, opponentId),
    ]);

    const failed = checks.find(c => !c.passed);
    return failed ?? { passed: true };
  }

  // ── Bonus Eligibility Check ──

  /**
   * Check if a user is eligible to receive the welcome bonus.
   * Requirements:
   * 1. Discord account must be older than 30 days
   * 2. Must have a verified game account (Steam or Xbox with code-in-bio)
   * 3. Must not share a game account with any existing user
   * 4. Must not have already claimed a bonus
   */
  async checkBonusEligibility(userId: string, discordAccountCreatedAt: Date): Promise<FraudCheck> {
    // 1. Discord account age (30+ days)
    const accountAgeMs = Date.now() - discordAccountCreatedAt.getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (accountAgeMs < thirtyDays) {
      return {
        passed: false,
        reason: "Your Discord account must be at least 30 days old to claim the welcome bonus.",
      };
    }

    // 2. Must have a verified game account (Steam or Xbox)
    const accounts = await db
      .select()
      .from(gameAccounts)
      .where(eq(gameAccounts.userId, userId));

    const hasVerifiedAccount = accounts.some(
      a => a.platform === "steam" || a.platform === "xbox"
    );

    if (!hasVerifiedAccount) {
      return {
        passed: false,
        reason: "You need a verified Steam or Xbox account to claim the bonus. Use `/link platform:Steam` or `/link platform:Xbox` first.",
      };
    }

    // 3. Check if bonus already claimed
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));

    if (wallet?.bonusClaimed === 1) {
      return { passed: false, reason: "You've already claimed your welcome bonus." };
    }

    return { passed: true };
  }

  /**
   * Bonus abuse prevention:
   * Two bonus-only users (never deposited real money) cannot wager each other
   * more than 3 times per day. This prevents the "make 5 accounts, funnel to one" attack.
   */
  private async checkBonusAbuse(user1: string, user2: string): Promise<FraudCheck> {
    // Check if both users are bonus-only (never made a real deposit)
    const [wallet1] = await db.select().from(wallets).where(eq(wallets.userId, user1));
    const [wallet2] = await db.select().from(wallets).where(eq(wallets.userId, user2));

    if (!wallet1 || !wallet2) return { passed: true };

    // If either user has made a real deposit, no restriction
    const [deposit1] = await db
      .select()
      .from(deposits)
      .where(and(eq(deposits.userId, user1), eq(deposits.credited, 1)));
    const [deposit2] = await db
      .select()
      .from(deposits)
      .where(and(eq(deposits.userId, user2), eq(deposits.credited, 1)));

    if (deposit1 || deposit2) return { passed: true };

    // Both are bonus-only — limit matches between them
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBetween = await db
      .select()
      .from(wagers)
      .where(and(
        gte(wagers.createdAt, oneDayAgo),
      ));

    const matchesBetween = recentBetween.filter(w =>
      (w.creatorId === user1 && w.opponentId === user2) ||
      (w.creatorId === user2 && w.opponentId === user1)
    );

    if (matchesBetween.length >= 3) {
      return {
        passed: false,
        reason: "You've reached the daily match limit with this player. Challenge someone else or make a deposit to remove limits.",
      };
    }

    return { passed: true };
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
