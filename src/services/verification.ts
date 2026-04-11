import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, gameAccounts } from "../db/schema.js";
import { wagerService } from "./wager.js";
import { getAdapter } from "./adapters/index.js";

/**
 * Attempts API-based auto-verification for a wager.
 * If the game adapter finds a match result, settles automatically.
 * Returns true if auto-settled, false if manual reporting needed.
 */
export async function tryAutoVerify(wagerId: string): Promise<boolean> {
  const wager = await wagerService.getWager(wagerId);
  if (!wager || wager.status !== "active") return false;

  const adapter = getAdapter(wager.game);
  if (!adapter || !adapter.supportsAutoVerify) return false;

  // Look up both players' linked accounts for this game's platform
  const platform = getPlatformForGame(wager.game);
  if (!platform) return false;

  const [creatorAccount] = await db
    .select()
    .from(gameAccounts)
    .where(and(eq(gameAccounts.userId, wager.creatorId), eq(gameAccounts.platform, platform)));

  const [opponentAccount] = await db
    .select()
    .from(gameAccounts)
    .where(and(eq(gameAccounts.userId, wager.opponentId!), eq(gameAccounts.platform, platform)));

  if (!creatorAccount || !opponentAccount) return false;

  // Try to find the match via API
  const result = await adapter.verifyMatch(
    creatorAccount.platformUserId,
    opponentAccount.platformUserId,
    wager.createdAt,
  );

  if (!result) return false;

  // Map platform user ID back to our user ID
  let winnerId: string;
  if (result.winnerId === creatorAccount.platformUserId) {
    winnerId = wager.creatorId;
  } else if (result.winnerId === opponentAccount.platformUserId) {
    winnerId = wager.opponentId!;
  } else {
    return false;
  }

  await wagerService.settleWager(wagerId, winnerId);
  return true;
}

function getPlatformForGame(game: string): string | null {
  const map: Record<string, string> = {
    lol: "riot",
    valorant: "riot",
    fifa: "ea",
    rocketleague: "steam",
    fortnite: "epic",
    cod: "activision",
  };
  return map[game] ?? null;
}
