import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, matchReports, disputes, wallets } from "../db/schema.js";
import { walletService } from "./wallet.js";
import { antiFraudService } from "./antifraud.js";
import { reputationService } from "./reputation.js";
import { identityService } from "./identity.js";
import { nanoid } from "nanoid";

const PLATFORM_FEE_PERCENT = parseInt(process.env.PLATFORM_FEE_PERCENT || "10");
const WAGER_ACCEPT_WINDOW_MS = 15 * 60 * 1000;    // 15 min to accept
const MATCH_DEADLINE_MS = 90 * 60 * 1000;          // 90 min to play & report
const CONFIRM_TIMEOUT_MS = 15 * 60 * 1000;         // 15 min for opponent to confirm/dispute after first report

export class WagerService {

  /** Create a new wager challenge */
  async createWager(creatorId: string, opponentId: string, game: string, amount: number, guildId?: string, channelId?: string, mode: "real" | "freeplay" = "real") {
    if (amount <= 0) throw new Error("Wager amount must be positive");
    if (creatorId === opponentId) throw new Error("Cannot wager against yourself");

    if (mode === "real") {
      // Anti-fraud checks only for real money
      const fraudCheck = await antiFraudService.preWagerCheck(creatorId, opponentId, amount);
      if (!fraudCheck.passed) throw new Error(fraudCheck.reason!);

      // Identity checks — both players must have linked a game account
      const creatorIdentity = await identityService.preWagerIdentityCheck(creatorId);
      if (creatorIdentity) throw new Error(creatorIdentity);
      const opponentIdentity = await identityService.preWagerIdentityCheck(opponentId);
      if (opponentIdentity) throw new Error(`Your opponent hasn't linked a game account yet. They need to use /link first.`);

      // Betting limits based on reputation
      const creatorLimit = await reputationService.checkWagerLimit(creatorId, amount);
      if (creatorLimit) throw new Error(creatorLimit);
      const opponentLimit = await reputationService.checkWagerLimit(opponentId, amount);
      if (opponentLimit) throw new Error(`Opponent's reputation is too low for this wager amount.`);

      // Check creator has funds
      const balance = await walletService.getBalance(creatorId);
      if (balance.available < amount) {
        throw new Error(`Insufficient balance. You have ${balance.available} tokens, need ${amount}.`);
      }
    } else {
      // Freeplay — check freeplay balance
      const balance = await walletService.getBalance(creatorId);
      if (balance.freeplay < amount) {
        throw new Error(`Insufficient freeplay coins. You have ${balance.freeplay}, need ${amount}. Use /daily to get more.`);
      }
    }

    const now = new Date();
    const fee = mode === "real" ? Math.floor((amount * 2 * PLATFORM_FEE_PERCENT) / 100) : 0;

    const wagerData = {
      id: nanoid(),
      mode,
      game,
      creatorId,
      opponentId,
      amount,
      fee,
      status: "pending" as const,
      guildId: guildId ?? null,
      channelId: channelId ?? null,
      expiresAt: new Date(now.getTime() + WAGER_ACCEPT_WINDOW_MS),
      matchDeadline: null,
      winnerId: null,
      settledAt: null,
    };

    const [created] = await db.insert(wagers).values(wagerData).returning();

    if (mode === "real") {
      await walletService.lockEscrow(creatorId, amount, created.id);
    } else {
      await walletService.lockFreeplayEscrow(creatorId, amount);
    }

    return created;
  }

  /** Opponent accepts the wager */
  async acceptWager(wagerId: string, opponentId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));

    if (!wager) throw new Error("Wager not found");
    if (wager.status !== "pending") throw new Error("Wager is no longer pending");
    if (wager.opponentId !== opponentId) throw new Error("You are not the challenged opponent");
    if (wager.expiresAt && wager.expiresAt < new Date()) throw new Error("Wager has expired");

    // Check opponent has funds and lock escrow
    if (wager.mode === "real") {
      const balance = await walletService.getBalance(opponentId);
      if (balance.available < wager.amount) {
        throw new Error(`Insufficient balance. You have ${balance.available} tokens, need ${wager.amount}.`);
      }
      await walletService.lockEscrow(opponentId, wager.amount, wagerId);
    } else {
      const balance = await walletService.getBalance(opponentId);
      if (balance.freeplay < wager.amount) {
        throw new Error(`Insufficient freeplay coins. You have ${balance.freeplay}, need ${wager.amount}. Use /daily to get more.`);
      }
      await walletService.lockFreeplayEscrow(opponentId, wager.amount);
    }

    // Move to active
    const now = new Date();
    const [updated] = await db.update(wagers)
      .set({
        status: "active",
        matchDeadline: new Date(now.getTime() + MATCH_DEADLINE_MS),
      })
      .where(eq(wagers.id, wagerId))
      .returning();

    return updated;
  }

  /** Player reports their result */
  async reportResult(wagerId: string, userId: string, result: "win" | "loss", screenshotUrl?: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));

    if (!wager) throw new Error("Wager not found");
    if (wager.status !== "active" && wager.status !== "reporting") {
      throw new Error("Wager is not in a reportable state");
    }
    if (userId !== wager.creatorId && userId !== wager.opponentId) {
      throw new Error("You are not part of this wager");
    }

    // Check if this user already reported
    const existingReports = await db.select().from(matchReports).where(eq(matchReports.wagerId, wagerId));
    const alreadyReported = existingReports.find(r => r.userId === userId);
    if (alreadyReported) {
      throw new Error("You already reported your result. Waiting for the other player.");
    }

    // Insert the report
    await db.insert(matchReports)
      .values({
        id: nanoid(),
        wagerId,
        userId,
        result,
        screenshotUrl: screenshotUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [matchReports.wagerId, matchReports.userId],
        set: { result, screenshotUrl: screenshotUrl ?? null, reportedAt: new Date() },
      });

    const isFirstReport = existingReports.length === 0;

    if (isFirstReport) {
      // First report — set confirm deadline (15 min for opponent to respond)
      const confirmDeadline = new Date(Date.now() + CONFIRM_TIMEOUT_MS);
      await db.update(wagers)
        .set({ status: "reporting", matchDeadline: confirmDeadline })
        .where(eq(wagers.id, wagerId));

      return {
        status: "waiting_confirm",
        message: "Result recorded. Opponent has 15 minutes to confirm or dispute.",
        confirmDeadline,
        firstReporterId: userId,
        firstResult: result,
      };
    }

    // Second report — try to settle
    return this.trySettle(wagerId);
  }

  /** Attempt to settle a wager based on reports */
  async trySettle(wagerId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");

    const reports = await db.select().from(matchReports).where(eq(matchReports.wagerId, wagerId));

    if (reports.length < 2) {
      return { status: "waiting", message: "Waiting for both players to report" };
    }

    const creatorReport = reports.find(r => r.userId === wager.creatorId);
    const opponentReport = reports.find(r => r.userId === wager.opponentId);

    if (!creatorReport || !opponentReport) {
      return { status: "waiting", message: "Waiting for both players to report" };
    }

    // Check if reports agree
    const creatorClaimsWin = creatorReport.result === "win";
    const opponentClaimsWin = opponentReport.result === "win";

    // They agree on a winner — reward both for honest reporting
    if (creatorClaimsWin && !opponentClaimsWin) {
      await reputationService.onHonestReport(wager.creatorId);
      await reputationService.onHonestReport(wager.opponentId!);
      return this.settleWager(wagerId, wager.creatorId);
    }
    if (!creatorClaimsWin && opponentClaimsWin) {
      await reputationService.onHonestReport(wager.creatorId);
      await reputationService.onHonestReport(wager.opponentId!);
      return this.settleWager(wagerId, wager.opponentId);
    }

    // Both claim win — dispute
    if (creatorClaimsWin && opponentClaimsWin) {
      return this.openDispute(wagerId, "Both players claim victory");
    }

    // Both claim loss — weird, refund
    if (!creatorClaimsWin && !opponentClaimsWin) {
      return this.refundWager(wagerId, "Both players reported a loss");
    }

    return { status: "error", message: "Unexpected report state" };
  }

  /** Settle a wager — pay the winner */
  async settleWager(wagerId: string, winnerId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");

    const loserId = winnerId === wager.creatorId ? wager.opponentId! : wager.creatorId;

    if (wager.mode === "freeplay") {
      // Freeplay — no fees, just move coins
      await walletService.settleFreeplay(winnerId, loserId, wager.amount);

      await db.update(wagers)
        .set({ status: "settled", winnerId, settledAt: new Date() })
        .where(eq(wagers.id, wagerId));

      return { status: "settled", winnerId, loserId, winnings: wager.amount * 2, fee: 0 };
    }

    // Real money
    const totalPot = wager.amount * 2;
    const winnings = totalPot - wager.fee;

    await db.update(wallets)
      .set({
        escrowed: sql`GREATEST(${wallets.escrowed} - ${wager.amount}, 0)`,
        available: sql`${wallets.available} + ${winnings}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, winnerId));

    await db.update(wallets)
      .set({
        escrowed: sql`GREATEST(${wallets.escrowed} - ${wager.amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, loserId));

    await walletService.logSettlement(winnerId, winnings, wagerId);
    await walletService.logFee(wager.fee, wagerId);

    await db.update(wagers)
      .set({ status: "settled", winnerId, settledAt: new Date() })
      .where(eq(wagers.id, wagerId));

    return { status: "settled", winnerId, loserId, winnings, fee: wager.fee };
  }

  /** Refund both players */
  async refundWager(wagerId: string, reason: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");

    if (wager.mode === "freeplay") {
      await walletService.refundFreeplayEscrow(wager.creatorId, wager.amount);
      if (wager.opponentId && wager.status !== "pending") {
        await walletService.refundFreeplayEscrow(wager.opponentId, wager.amount);
      }
    } else {
      await walletService.refundEscrow(wager.creatorId, wager.amount, wagerId);
      if (wager.opponentId && wager.status !== "pending") {
        await walletService.refundEscrow(wager.opponentId, wager.amount, wagerId);
      }
    }

    await db.update(wagers)
      .set({ status: "cancelled", settledAt: new Date() })
      .where(eq(wagers.id, wagerId));

    return { status: "refunded", reason };
  }

  /** Cancel a pending wager (creator only) */
  async cancelWager(wagerId: string, userId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));

    if (!wager) throw new Error("Wager not found");
    if (wager.status !== "pending") throw new Error("Can only cancel pending wagers");
    if (wager.creatorId !== userId) throw new Error("Only the creator can cancel");

    if (wager.mode === "freeplay") {
      await walletService.refundFreeplayEscrow(wager.creatorId, wager.amount);
    } else {
      await walletService.refundEscrow(wager.creatorId, wager.amount, wagerId);
    }

    await db.update(wagers).set({ status: "cancelled" }).where(eq(wagers.id, wagerId));
    return { status: "cancelled" };
  }

  /** Open a dispute */
  async openDispute(wagerId: string, reason: string) {
    await db.update(wagers)
      .set({ status: "disputed" })
      .where(eq(wagers.id, wagerId));

    const [dispute] = await db.insert(disputes)
      .values({ id: nanoid(), wagerId, reason, status: "evidence" })
      .returning();

    return { status: "disputed", disputeId: dispute.id, reason };
  }

  /** Resolve a dispute (mod/admin action) */
  async resolveDispute(disputeId: string, resolution: "creator_wins" | "opponent_wins" | "refund", resolvedBy: string) {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.id, disputeId));
    if (!dispute) throw new Error("Dispute not found");

    const [wager] = await db.select().from(wagers).where(eq(wagers.id, dispute.wagerId));
    if (!wager) throw new Error("Wager not found");

    let result;
    if (resolution === "creator_wins") {
      result = await this.settleWager(wager.id, wager.creatorId);
    } else if (resolution === "opponent_wins") {
      result = await this.settleWager(wager.id, wager.opponentId!);
    } else {
      result = await this.refundWager(wager.id, "Dispute resolved as refund");
    }

    await db.update(disputes)
      .set({ status: "resolved", resolution, resolvedBy, resolvedAt: new Date() })
      .where(eq(disputes.id, disputeId));

    return result;
  }

  /** Get wager by ID */
  async getWager(wagerId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    return wager ?? null;
  }

  /**
   * Auto-confirm a first report after the 15-min timeout.
   * If only one player reported and the deadline passed, their report stands.
   */
  async autoConfirmFirstReport(wagerId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager || wager.status !== "reporting") return null;

    const reports = await db.select().from(matchReports).where(eq(matchReports.wagerId, wagerId));
    if (reports.length !== 1) return null; // either 0 or already 2

    const report = reports[0];
    const nonReporterId = report.userId === wager.creatorId ? wager.opponentId! : wager.creatorId;

    if (report.result === "win") {
      // Reporter claims win, opponent didn't respond — reporter wins
      await reputationService.onNoShow(nonReporterId);
      return this.settleWager(wagerId, report.userId);
    } else {
      // Reporter claims loss, opponent didn't respond — opponent wins by admission
      await reputationService.onNoShow(nonReporterId);
      return this.settleWager(wagerId, nonReporterId);
    }
  }
}

export const wagerService = new WagerService();
