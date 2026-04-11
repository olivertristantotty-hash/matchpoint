import { eq, and, lte, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, matchReports } from "../db/schema.js";
import { wagerService } from "./wager.js";
import { reputationService } from "./reputation.js";

/**
 * Runs periodic checks for:
 * 1. Expired pending wagers (no one accepted)
 * 2. First-reporter confirm timeout (15 min to respond)
 * 3. Match deadlines passed (nobody reported at all)
 */
export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null;

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
    try {
      await this.expirePendingWagers();
      await this.handleConfirmTimeouts();
      await this.handleMatchDeadlines();
    } catch (err) {
      console.error("[Scheduler] Error in tick:", err);
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

        await this.notifyThread(wager, `⏰ **Match deadline passed.** Neither player reported. Tokens refunded. Both players received a reputation penalty.`);
      } catch (err) {
        console.error(`[Scheduler] Deadline error for ${wager.id}:`, err);
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
