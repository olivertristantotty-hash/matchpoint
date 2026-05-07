import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wallets, transactions } from "../db/schema.js";
import { walletService } from "./wallet.js";
import { nanoid } from "nanoid";

const WELCOME_BONUS_MP = 500;   // 500 MP = $5.00
const MAX_BONUS_USERS = 20;    // first 20 users only

export class UserService {
  /** Get or create a user from their Discord info */
  async ensureUser(discordId: string, username: string) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId));

    if (existing) return existing;

    const userId = nanoid();
    const [user] = await db
      .insert(users)
      .values({ id: userId, discordId, username })
      .returning();

    // Create their wallet
    await walletService.getWallet(userId);

    // Welcome bonus — first N users get free MP
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wallets)
        .where(eq(wallets.bonusClaimed, 1));

      if (count < MAX_BONUS_USERS) {
        await db.update(wallets)
          .set({
            available: sql`${wallets.available} + ${WELCOME_BONUS_MP}`,
            bonusClaimed: 1,
            bonusAmount: WELCOME_BONUS_MP,
            updatedAt: new Date(),
          })
          .where(eq(wallets.userId, userId));

        // Log the bonus transaction
        await db.insert(transactions).values({
          id: nanoid(),
          userId,
          type: "deposit",
          amount: WELCOME_BONUS_MP,
          wagerId: null,
          description: "Welcome bonus",
        });

        // DM the user about their bonus
        try {
          const { getBotClient } = await import("../bot/notifications.js");
          const client = getBotClient();
          if (client) {
            const discordUser = await client.users.fetch(discordId);
            await discordUser.send({
              embeds: [{
                title: "🎉 Welcome Bonus — 500 MP",
                description: [
                  `You've been credited **500 MP ($5.00)** to get started.`,
                  ``,
                  `**How to use it:**`,
                  `• Right-click any player → Apps → **Challenge to Wager**`,
                  `• Or use \`/wager @opponent game amount\``,
                  ``,
                  `**Withdrawal rules:**`,
                  `• Wager at least 2,500 MP total before withdrawing`,
                  `• Win at least 1 match against a player who has deposited`,
                  ``,
                  `Good luck. Check your balance anytime with \`/balance\`.`,
                ].join("\n"),
                color: 0x27ae60,
                footer: { text: "MATCHPOINT" },
              }],
            });
          }
        } catch (dmErr) {
          // DMs might be disabled — not critical
          console.log("[User] Could not DM welcome bonus notification:", (dmErr as Error).message);
        }
      }
    } catch (err) {
      console.error("[User] Failed to grant welcome bonus:", err);
    }

    return user;
  }

  /** Find user by Discord ID */
  async findByDiscordId(discordId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId));
    return user ?? null;
  }
}

export const userService = new UserService();
