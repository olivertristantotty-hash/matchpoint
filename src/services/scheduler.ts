import { eq, and, lte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, matchReports, users, disputes } from "../db/schema.js";
import { wagerService } from "./wager.js";
import { reputationService } from "./reputation.js";
import { lobbyService } from "./lobby.js";
import { leaderboardService } from "./leaderboard.js";

/**
 * Runs periodic checks for:
 * 1. Expired pending wagers (no one accepted)
 * 2. First-reporter confirm timeout (15 min to respond)
 * 3. Match deadlines passed (nobody reported at all)
 */
export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  start(intervalMs = 30_000) {
    console.log("[Scheduler] Starting periodic checks (every 30s)...");
    this.interval = setInterval(() => this.tick(), intervalMs);
    this.tick();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick() {
    this.tickCount++;
    try {
      await this.expireLobbies();
      await this.expirePendingWagers();
      await this.handleConfirmTimeouts();
      await this.handleMatchDeadlines();
      await this.handleDisputeEvidence();

      // Check for season rollover on every tick (lightweight date comparison)
      try {
        await leaderboardService.checkSeasonRollover();
      } catch (err) {
        console.error("[Scheduler] Error checking season rollover:", err);
      }

      if (this.tickCount % 10 === 0) {
        await this.refreshLeaderboard();
      }
    } catch (err) {
      console.error("[Scheduler] Error in tick:", err);
    }
  }

  /** Refresh the persistent leaderboard embed for all guilds (every 5 minutes) */
  private async refreshLeaderboard() {
    try {
      const { getBotClient } = await import("../bot/notifications.js");
      const client = getBotClient();
      if (!client) return;

      for (const [guildId] of client.guilds.cache) {
        await leaderboardService.refreshPersistentEmbed(guildId);
      }
    } catch (err) {
      console.error("[Scheduler] Error refreshing leaderboard:", err);
    }
  }

  /** Expire lobby wagers that have passed their expiresAt timestamp */
  private async expireLobbies() {
    const now = new Date();
    const expired = await db
      .select()
      .from(wagers)
      .where(
        and(
          eq(wagers.status, "pending"),
          lte(wagers.expiresAt, now),
          isNotNull(wagers.lobbyMessageId),
        ),
      );

    for (const wager of expired) {
      try {
        await lobbyService.expireLobby(wager.id);

        // Delete the expired lobby message from the channel
        if (wager.lobbyMessageId && wager.lobbyChannelId) {
          const { getBotClient } = await import("../bot/notifications.js");
          const client = getBotClient();
          if (client) {
            try {
              const channel = await client.channels.fetch(wager.lobbyChannelId);
              if (channel?.isTextBased()) {
                const message = await (channel as any).messages.fetch(wager.lobbyMessageId);
                if (message) {
                  await message.delete();
                }
              }
            } catch {}
          }
        }

        console.log(`[Scheduler] Expired lobby ${wager.id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to expire lobby ${wager.id}:`, err);
      }
    }
  }

  /** Cancel wagers that weren't accepted in time */
  private async expirePendingWagers() {
    const now = new Date();
    const expired = await db
      .select()
      .from(wagers)
      .where(and(eq(wagers.status, "pending"), lte(wagers.expiresAt, now)));

    for (const wager of expired) {
      try {
        await wagerService.refundWager(wager.id, "Wager expired — opponent did not accept");
        await db.update(wagers).set({ status: "expired" }).where(eq(wagers.id, wager.id));
        console.log(`[Scheduler] Expired wager ${wager.id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to expire ${wager.id}:`, err);
      }
    }
  }

  /**
   * Handle first-reporter confirm timeouts.
   * If a wager is in "reporting" status and the matchDeadline has passed,
   * check if only one player reported. If so, auto-confirm their result.
   */
  private async handleConfirmTimeouts() {
    const now = new Date();
    const reporting = await db
      .select()
      .from(wagers)
      .where(and(eq(wagers.status, "reporting"), lte(wagers.matchDeadline, now)));

    for (const wager of reporting) {
      try {
        const reports = await db
          .select()
          .from(matchReports)
          .where(eq(matchReports.wagerId, wager.id));

        if (reports.length === 1) {
          // Only one player reported — auto-confirm after timeout
          const result = await wagerService.autoConfirmFirstReport(wager.id);
          if (result) {
            console.log(`[Scheduler] Auto-confirmed wager ${wager.id} — first reporter's result stands`);

            // Notify in thread
            await this.notifyThread(wager, `⏰ **Time's up!** Opponent didn't respond in 15 minutes. First reporter's result has been auto-confirmed.`);
          }
        } else if (reports.length === 2) {
          // Both reported but not settled — try settling
          await wagerService.trySettle(wager.id);
        } else {
          // Neither reported and deadline passed — refund
          await wagerService.refundWager(wager.id, "Neither player reported results");
          await reputationService.onNoShow(wager.creatorId);
          await reputationService.onNoShow(wager.opponentId!);
          console.log(`[Scheduler] Double no-show on wager ${wager.id}`);
        }
      } catch (err) {
        console.error(`[Scheduler] Confirm timeout error for ${wager.id}:`, err);
      }
    }
  }

  /**
   * Handle active wagers where the full match deadline passed
   * and nobody reported at all.
   */
  private async handleMatchDeadlines() {
    const now = new Date();
    const overdue = await db
      .select()
      .from(wagers)
      .where(and(eq(wagers.status, "active"), lte(wagers.matchDeadline, now)));

    for (const wager of overdue) {
      try {
        // Nobody reported anything — refund both, penalize both
        await wagerService.refundWager(wager.id, "Neither player reported results");
        await reputationService.onNoShow(wager.creatorId);
        await reputationService.onNoShow(wager.opponentId!);
        console.log(`[Scheduler] Match deadline passed, no reports — refunded wager ${wager.id}`);

        await this.notifyThread(wager, `⏰ **Match deadline passed.** Neither player reported. MP refunded. Both players received a reputation penalty.`);
      } catch (err) {
        console.error(`[Scheduler] Deadline error for ${wager.id}:`, err);
      }
    }
  }

  /** Handle disputes where the 5-minute evidence window has expired */
  private async handleDisputeEvidence() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const { tryAutoResolveDispute } = await import("./auto-dispute.js");

    const pendingDisputes = await db
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.status, "evidence"),
          lte(disputes.createdAt, fiveMinutesAgo),
        ),
      );

    for (const dispute of pendingDisputes) {
      try {
        const [wager] = await db.select().from(wagers).where(eq(wagers.id, dispute.wagerId));
        if (!wager) continue;

        // Skip if wager is already settled/cancelled/expired
        if (["settled", "cancelled", "expired"].includes(wager.status)) {
          await db.update(disputes)
            .set({ status: "resolved", resolution: "refund", resolvedAt: new Date() })
            .where(eq(disputes.id, dispute.id));
          continue;
        }

        const autoResult = await tryAutoResolveDispute(dispute.wagerId);

        if (autoResult.resolved) {
          await this.notifyThread(wager, `🤖 **Auto-resolved:** ${autoResult.reason}`);

          // Announce result if settled (not refunded)
          if (autoResult.winnerId && wager.guildId) {
            const { announceResult } = await import("../bot/notifications.js");
            const [winner] = await db.select().from(users).where(eq(users.id, autoResult.winnerId));
            const loserId = autoResult.winnerId === wager.creatorId ? wager.opponentId! : wager.creatorId;
            const [loser] = await db.select().from(users).where(eq(users.id, loserId));
            await announceResult(
              wager.guildId,
              winner?.discordId ?? autoResult.winnerId,
              loser?.username ?? "Unknown",
              wager.game,
              wager.amount * 2 - wager.fee,
              wager.id,
            );
          }

          // Archive thread
          try {
            const { getBotClient } = await import("../bot/notifications.js");
            const client = getBotClient();
            if (client && wager.channelId) {
              const thread = await client.channels.fetch(wager.channelId);
              if (thread?.isTextBased()) {
                setTimeout(async () => {
                  try {
                    await (thread as any).setArchived(true);
                    await (thread as any).setLocked(true);
                  } catch {}
                }, 10000);
              }
            }
          } catch {}

          console.log(`[Scheduler] Auto-resolved dispute for wager ${dispute.wagerId}: ${autoResult.method}`);
        } else {
          // Escalate to mod review
          await db.update(disputes)
            .set({ status: "mod_review" })
            .where(eq(disputes.id, dispute.id));

          await this.notifyThread(wager, `🤖 Auto-resolution inconclusive. Escalating to **moderator review**. A mod will review the evidence and make a decision.`);
          console.log(`[Scheduler] Dispute for wager ${dispute.wagerId} escalated to mod review`);
        }
      } catch (err) {
        console.error(`[Scheduler] Error handling dispute evidence for ${dispute.wagerId}:`, err);
      }
    }
  }

  /** Send a message to a wager's thread */
  private async notifyThread(wager: any, content: string) {
    try {
      const { getBotClient } = await import("../bot/notifications.js");
      const client = getBotClient();
      if (!client || !wager.channelId) return;
      const thread = await client.channels.fetch(wager.channelId);
      if (thread?.isTextBased()) {
        await (thread as any).send(content);
      }
    } catch {}
  }
}

export const scheduler = new Scheduler();
