import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wallets, transactions } from "../db/schema.js";
import { walletService } from "./wallet.js";
import { nanoid } from "nanoid";

const WELCOME_BONUS_MP = 500;   // 500 MP = $5.00
const MAX_BONUS_USERS = 20;    // first 20 users only
const PROMO_CODE = "FIRST20MAY";

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
        // Don't auto-credit — send them the promo code via DM instead
        try {
          const { getBotClient } = await import("../bot/notifications.js");
          const client = getBotClient();
          if (client) {
            const discordUser = await client.users.fetch(discordId);
            await discordUser.send({
              embeds: [{
                title: "🎁 Welcome Bonus — $5 Free",
                description: [
                  `You've been selected for a **500 MP ($5.00)** welcome bonus!`,
                  ``,
                  `**Redeem it on the website:**`,
                  `1. Go to https://matchpoint-rho-ten.vercel.app/wallet`,
                  `2. Sign in with Discord`,
                  `3. Enter promo code: **\`${PROMO_CODE}\`**`,
                  ``,
                  `This code is limited to the first 20 players. Use it before it runs out.`,
                ].join("\n"),
                color: 0x27ae60,
                footer: { text: "MATCHPOINT" },
              }],
            });
          }
        } catch (dmErr) {
          console.log("[User] Could not DM promo code:", (dmErr as Error).message);
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
