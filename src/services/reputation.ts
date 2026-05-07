import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

/**
 * Reputation system:
 * - All users start at 100
 * - Honest reporting: +2
 * - Winning a dispute (you were right): +5
 * - Losing a dispute: instant permaban (zero tolerance)
 * - No-show (didn't report): -10 + 1 strike
 * - 3 strikes = ban
 *
 * Betting limits scale with reputation:
 *   0-49   (Untrusted): 0 (can't wager real money)
 *   50-99  (Caution):   250 MP max
 *   100-149 (Good):     500 MP max
 *   150-299 (Trusted):  1,000 MP max
 *   300-499 (Veteran):  2,500 MP max
 *   500-999 (Elite):    5,000 MP max
 *   1000+  (Legend):    10,000 MP max
 *
 * Freeplay has no limits.
 */
export class ReputationService {

  async reward(userId: string, points: number) {
    await db.update(users)
      .set({ reputation: sql`${users.reputation} + ${points}` })
      .where(eq(users.id, userId));
    await this.updateNickname(userId);
  }

  async penalize(userId: string, points: number) {
    await db.update(users)
      .set({ reputation: sql`GREATEST(${users.reputation} - ${points}, 0)` })
      .where(eq(users.id, userId));
    await this.updateNickname(userId);
  }

  async addStrike(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return;

    const newStrikes = user.strikes + 1;
    const banned = newStrikes >= 3 ? 1 : 0;

    await db.update(users)
      .set({ strikes: newStrikes, banned })
      .where(eq(users.id, userId));

    return { strikes: newStrikes, banned: banned === 1 };
  }

  /** Called when reports agree — reward both for honesty */
  async onHonestReport(userId: string) {
    await this.reward(userId, 2);
  }

  /** Called when a player wins a dispute */
  async onDisputeWon(userId: string) {
    await this.reward(userId, 5);
  }

  /** Called when a player loses a dispute (they lied) */
  async onDisputeLost(userId: string) {
    await this.penalize(userId, 15);
    // Zero tolerance — instant permaban for fake results
    await db.update(users)
      .set({ strikes: 3, banned: 1 })
      .where(eq(users.id, userId));
    return { strikes: 3, banned: true };
  }

  /** Called when a player fails to report */
  async onNoShow(userId: string) {
    await this.penalize(userId, 10);
    return this.addStrike(userId);
  }

  async getReputation(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;
    return {
      reputation: user.reputation,
      strikes: user.strikes,
      banned: user.banned === 1,
      tier: this.getTier(user.reputation),
    };
  }

  /** Get a short display string like "⭐ 162" for wager cards */
  getRepBadge(reputation: number): string {
    const tier = this.getTier(reputation);
    const emoji = this.getTierEmoji(tier);
    return `${emoji} ${reputation}`;
  }

  /** Get just the emoji for nicknames */
  getRepEmoji(reputation: number): string {
    return this.getTierEmoji(this.getTier(reputation));
  }

  /** Get the maximum wager amount for a given reputation */
  getMaxWager(reputation: number): number {
    if (reputation >= 1000) return 10000;
    if (reputation >= 500) return 5000;
    if (reputation >= 300) return 2500;
    if (reputation >= 150) return 1000;
    if (reputation >= 100) return 500;
    if (reputation >= 50) return 250;
    return 0; // Untrusted can't wager real money
  }

  /** Check if a user can wager a specific amount. Returns error message or null. */
  async checkWagerLimit(userId: string, amount: number): Promise<string | null> {
    const rep = await this.getReputation(userId);
    if (!rep) return "User not found.";

    const max = this.getMaxWager(rep.reputation);
    if (max === 0) {
      return `Your reputation is too low to wager real money (${rep.reputation} rep, need 50+). Play freeplay to build your rep.`;
    }
    if (amount > max) {
      return `Your rep (${rep.reputation}) allows a max wager of **${max}** MP. Current tier: ${rep.tier}. Win more matches to unlock higher stakes.`;
    }
    return null;
  }

  private getTierEmoji(tier: string): string {
    switch (tier) {
      case "Legend": return "👑";
      case "Elite": return "💎";
      case "Veteran": return "🏆";
      case "Trusted": return "⭐";
      case "Good": return "✅";
      case "Caution": return "⚠️";
      default: return "🚫";
    }
  }

  private getTier(rep: number): string {
    if (rep >= 1000) return "Legend";
    if (rep >= 500) return "Elite";
    if (rep >= 300) return "Veteran";
    if (rep >= 150) return "Trusted";
    if (rep >= 100) return "Good";
    if (rep >= 50) return "Caution";
    return "Untrusted";
  }

  /** Update a user's Discord nickname and tier role */
  private async updateNickname(userId: string) {
    try {
      const { getBotClient } = await import("../bot/notifications.js");
      const client = getBotClient();
      if (!client) return;

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;

      const tier = this.getTier(user.reputation);
      const emoji = this.getTierEmoji(tier);

      // Strip any existing badge prefix from the username
      const cleanName = user.username.replace(/^[👑💎🏆⭐✅⚠️🚫]\s*\d*\s*/, "").trim();
      const newNick = `${emoji} ${cleanName}`;

      const allTiers = ["Legend", "Elite", "Veteran", "Trusted", "Good", "Caution", "Untrusted"];

      for (const [, guild] of client.guilds.cache) {
        try {
          const member = await guild.members.fetch(user.discordId).catch(() => null);
          if (!member) continue;

          // Update nickname (skip if server owner — Discord won't allow it)
          if (member.manageable) {
            await member.setNickname(newNick);
          }

          // Update tier role — remove old tier roles, add current one
          await guild.roles.fetch();
          for (const tierName of allTiers) {
            const role = guild.roles.cache.find(r => r.name === tierName);
            if (!role) continue;

            if (tierName === tier) {
              if (!member.roles.cache.has(role.id)) await member.roles.add(role);
            } else {
              if (member.roles.cache.has(role.id)) await member.roles.remove(role);
            }
          }
        } catch {}
      }
    } catch {}
  }
}

export const reputationService = new ReputationService();
