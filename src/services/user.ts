import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { walletService } from "./wallet.js";
import { nanoid } from "nanoid";

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
