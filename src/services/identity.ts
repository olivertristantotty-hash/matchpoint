import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, gameAccounts } from "../db/schema.js";

/**
 * Identity & anti-alt service.
 *
 * Layers of protection:
 * 1. Require at least one linked game account before first wager
 * 2. Ban linked game accounts when a user is banned (not just Discord ID)
 * 3. Check if a game account is already linked to a banned user
 */
export class IdentityService {

  /** Check if a user has linked at least one game account */
  async hasLinkedAccount(userId: string): Promise<boolean> {
    const accounts = await db
      .select()
      .from(gameAccounts)
      .where(eq(gameAccounts.userId, userId));
    return accounts.length > 0;
  }

  /**
   * Check if a platform account is already linked to a banned user.
   * Prevents banned users from creating a new Discord account and
   * linking the same gamertag.
   */
  async isGameAccountBanned(platform: string, platformUserId: string): Promise<boolean> {
    // Find all users who have this game account linked
    const linked = await db
      .select()
      .from(gameAccounts)
      .where(and(
        eq(gameAccounts.platform, platform),
        eq(gameAccounts.platformUserId, platformUserId),
      ));

    for (const account of linked) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, account.userId));
      if (user?.banned) return true;
    }

    return false;
  }

  /**
   * When banning a user, also flag all their linked game accounts
   * so they can't be reused on a new Discord account.
   * (The accounts stay in the DB — isGameAccountBanned checks them)
   */
  async getLinkedAccounts(userId: string) {
    return db
      .select()
      .from(gameAccounts)
      .where(eq(gameAccounts.userId, userId));
  }

  /**
   * Pre-wager identity check.
   * Returns an error message if the user can't wager, or null if OK.
   */
  async preWagerIdentityCheck(userId: string): Promise<string | null> {
    const hasAccount = await this.hasLinkedAccount(userId);
    if (!hasAccount) {
      return "You need to link a game account before wagering. Use `/link` to connect your gamertag.";
    }
    return null;
  }
}

export const identityService = new IdentityService();
