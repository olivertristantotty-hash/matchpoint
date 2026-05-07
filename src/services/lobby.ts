import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers } from "../db/schema.js";
import { walletService } from "./wallet.js";
import { antiFraudService } from "./antifraud.js";
import { reputationService } from "./reputation.js";
import { identityService } from "./identity.js";
import { getGameProfile } from "./games/profiles.js";
import { EmbedBuilder } from "discord.js";
import { nanoid } from "nanoid";

const PLATFORM_FEE_PERCENT = parseInt(process.env.PLATFORM_FEE_PERCENT || "10");
const MATCH_DEADLINE_MS = 90 * 60 * 1000; // 90 min to play & report
const LOBBY_EXPIRY_MINUTES = parseInt(process.env.LOBBY_EXPIRY_MINUTES || "30");

// ── Types ──

export interface LobbyOptions {
  hostId: string;
  game: string;
  platform: string;
  amount: number;
  mode: "real" | "freeplay";
  gameMode?: string;
  teamSize?: string;
  rulesNotes?: string;
  roundsFormat?: string;
  guildId?: string;
}

export type LobbyStatus = "open" | "matched" | "expired" | "cancelled";

// ── Embed color map ──

const LOBBY_COLORS: Record<LobbyStatus, number> = {
  open: 0xffd700,      // gold
  matched: 0x00ff00,   // green
  expired: 0x808080,   // grey
  cancelled: 0xff0000, // red
};

// ── Service ──

export class LobbyService {

  // ── 2.2  hasActiveLobby ──

  async hasActiveLobby(userId: string): Promise<boolean> {
    // Lobby wagers have null opponentId while pending.
    // lobbyMessageId is set by the handler *after* createLobby returns,
    // so we use null opponentId as the lobby indicator.
    const rows = await db
      .select({ id: wagers.id })
      .from(wagers)
      .where(
        and(
          eq(wagers.creatorId, userId),
          eq(wagers.status, "pending"),
          isNull(wagers.opponentId),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  // ── 2.3  createLobby ──

  async createLobby(options: LobbyOptions) {
    const { hostId, game, platform, amount, mode, gameMode, teamSize, rulesNotes, roundsFormat, guildId } = options;

    if (amount <= 0) throw new Error("Wager amount must be positive");

    // ── Validation by mode ──
    if (mode === "real") {
      // Anti-fraud (pass hostId twice since there's no opponent yet)
      const fraudCheck = await antiFraudService.preWagerCheck(hostId, hostId, amount);
      if (!fraudCheck.passed) throw new Error(fraudCheck.reason!);

      // Identity — host must have a linked game account
      const identityErr = await identityService.preWagerIdentityCheck(hostId);
      if (identityErr) throw new Error(identityErr);

      // Reputation-based betting limit
      const repErr = await reputationService.checkWagerLimit(hostId, amount);
      if (repErr) throw new Error(repErr);

      // Balance check
      const balance = await walletService.getBalance(hostId);
      if (balance.available < amount) {
        throw new Error(`Insufficient balance. You have ${balance.available} MP, need ${amount}.`);
      }
    } else {
      // Freeplay — only check freeplay balance
      const balance = await walletService.getBalance(hostId);
      if (balance.freeplay < amount) {
        throw new Error(`Insufficient freeplay FP. You have ${balance.freeplay}, need ${amount}. Use /daily to get more.`);
      }
    }

    // ── Duplicate lobby check ──
    const hasDuplicate = await this.hasActiveLobby(hostId);
    if (hasDuplicate) {
      throw new Error("You already have an open lobby. Cancel it first.");
    }

    // ── Create wager record directly (no WagerService — opponentId is null) ──
    const now = new Date();
    const fee = mode === "real" ? Math.floor((amount * 2 * PLATFORM_FEE_PERCENT) / 100) : 0;

    const wagerData = {
      id: nanoid(),
      mode,
      game,
      creatorId: hostId,
      opponentId: null,
      amount,
      fee,
      status: "pending" as const,
      guildId: guildId ?? null,
      channelId: null,
      expiresAt: new Date(now.getTime() + LOBBY_EXPIRY_MINUTES * 60 * 1000),
      matchDeadline: null,
      winnerId: null,
      settledAt: null,
      // Lobby metadata
      platform,
      gameMode: gameMode ?? null,
      teamSize: teamSize ?? null,
      rulesNotes: rulesNotes ?? null,
      roundsFormat: roundsFormat ?? null,
      lobbyMessageId: null,
      lobbyChannelId: null,
    };

    const [created] = await db.insert(wagers).values(wagerData).returning();

    // ── Lock escrow ──
    if (mode === "real") {
      await walletService.lockEscrow(hostId, amount, created.id);
      await walletService.addToTotalWagered(hostId, amount);
    } else {
      await walletService.lockFreeplayEscrow(hostId, amount);
    }

    return created;
  }

  // ── 2.4  acceptLobby ──

  async acceptLobby(wagerId: string, opponentId: string, guildId: string) {
    // Fetch the wager
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");

    // Self-check
    if (wager.creatorId === opponentId) {
      throw new Error("You can't accept your own lobby.");
    }

    // Status check
    if (wager.status !== "pending") {
      throw new Error("This lobby is no longer available.");
    }

    // ── Validation by mode ──
    if (wager.mode === "real") {
      // Anti-fraud
      const fraudCheck = await antiFraudService.preWagerCheck(wager.creatorId, opponentId, wager.amount);
      if (!fraudCheck.passed) throw new Error(fraudCheck.reason!);

      // Identity
      const identityErr = await identityService.preWagerIdentityCheck(opponentId);
      if (identityErr) throw new Error(identityErr);

      // Reputation
      const repErr = await reputationService.checkWagerLimit(opponentId, wager.amount);
      if (repErr) throw new Error(repErr);

      // Balance
      const balance = await walletService.getBalance(opponentId);
      if (balance.available < wager.amount) {
        throw new Error(`Insufficient balance. You have ${balance.available} MP, need ${wager.amount}.`);
      }
    } else {
      // Freeplay balance
      const balance = await walletService.getBalance(opponentId);
      if (balance.freeplay < wager.amount) {
        throw new Error(`Insufficient freeplay FP. You have ${balance.freeplay}, need ${wager.amount}. Use /daily to get more.`);
      }
    }

    // ── Lock opponent escrow ──
    if (wager.mode === "real") {
      await walletService.lockEscrow(opponentId, wager.amount, wagerId);
      await walletService.addToTotalWagered(opponentId, wager.amount);
    } else {
      await walletService.lockFreeplayEscrow(opponentId, wager.amount);
    }

    // ── Atomic DB update — only succeeds if still pending with no opponent ──
    const now = new Date();
    const [updated] = await db
      .update(wagers)
      .set({
        opponentId,
        status: "active",
        matchDeadline: new Date(now.getTime() + MATCH_DEADLINE_MS),
      })
      .where(
        and(
          eq(wagers.id, wagerId),
          eq(wagers.status, "pending"),
          isNull(wagers.opponentId),
        ),
      )
      .returning();

    if (!updated) {
      // Race condition — another player accepted first. Refund opponent escrow.
      if (wager.mode === "real") {
        await walletService.refundEscrow(opponentId, wager.amount, wagerId);
      } else {
        await walletService.refundFreeplayEscrow(opponentId, wager.amount);
      }
      throw new Error("Lobby already taken or no longer available.");
    }

    return updated;
  }

  // ── 2.5  cancelLobby ──

  async cancelLobby(wagerId: string, userId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");
    if (wager.creatorId !== userId) throw new Error("Only the host can cancel this lobby.");
    if (wager.status !== "pending") throw new Error("Can only cancel a pending lobby.");

    // Refund host escrow
    if (wager.mode === "real") {
      await walletService.refundEscrow(userId, wager.amount, wagerId);
    } else {
      await walletService.refundFreeplayEscrow(userId, wager.amount);
    }

    // Transition to cancelled
    await db.update(wagers).set({ status: "cancelled" }).where(eq(wagers.id, wagerId));
  }

  // ── 2.6  expireLobby ──

  async expireLobby(wagerId: string) {
    const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
    if (!wager) throw new Error("Wager not found");
    if (wager.status !== "pending") return; // already handled

    // Refund host escrow
    if (wager.mode === "real") {
      await walletService.refundEscrow(wager.creatorId, wager.amount, wagerId);
    } else {
      await walletService.refundFreeplayEscrow(wager.creatorId, wager.amount);
    }

    // Transition to expired
    await db.update(wagers).set({ status: "expired" }).where(eq(wagers.id, wagerId));
  }

  // ── 2.7  buildLobbyEmbed ──

  buildLobbyEmbed(
    wager: typeof wagers.$inferSelect,
    hostUser: { username: string; reputation: number },
    status: LobbyStatus,
  ): EmbedBuilder {
    const profile = getGameProfile(wager.game);
    const gameName = profile?.name ?? wager.game;
    const platformLabel = wager.platform ?? "Unknown";
    const currencyLabel = wager.mode === "real" ? "MP" : "FP";
    const repBadge = reputationService.getRepBadge(hostUser.reputation);

    const embed = new EmbedBuilder()
      .setColor(LOBBY_COLORS[status])
      .setTitle(`${gameName}${wager.rulesNotes ? ` — ${wager.rulesNotes}` : ""} — ${platformLabel}`);

    // Game cover thumbnail
    if (profile?.thumbnailUrl) {
      embed.setThumbnail(profile.thumbnailUrl);
    }

    // Amount field
    embed.addFields({ name: "Amount", value: `${wager.amount} ${currencyLabel}`, inline: true });

    // Host field with rep badge
    embed.addFields({ name: "Host", value: `${hostUser.username}  ${repBadge}`, inline: true });

    // Optional metadata fields
    if (wager.gameMode) {
      embed.addFields({ name: "Game Mode", value: wager.gameMode, inline: true });
    }
    if (wager.teamSize) {
      embed.addFields({ name: "Team Size", value: wager.teamSize, inline: true });
    }
    if (wager.roundsFormat) {
      embed.addFields({ name: "Rounds Format", value: wager.roundsFormat, inline: true });
    }

    // Expiry countdown
    if (wager.expiresAt && status === "open") {
      const expiresUnix = Math.floor(wager.expiresAt.getTime() / 1000);
      embed.addFields({ name: "Expires", value: `<t:${expiresUnix}:R>`, inline: true });
    }

    // Rules in footer — show custom rules if provided, otherwise just "Standard Rules"
    if (wager.rulesNotes) {
      embed.setFooter({ text: wager.rulesNotes });
    } else {
      embed.setFooter({ text: "Standard Rules" });
    }

    return embed;
  }
}

export const lobbyService = new LobbyService();
