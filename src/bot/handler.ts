import { ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, TextChannel, ThreadAutoArchiveDuration } from "discord.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, gameAccounts, users, matchReports, transactions } from "../db/schema.js";
import { userService } from "../services/user.js";
import { walletService } from "../services/wallet.js";
import { wagerService } from "../services/wager.js";
import { reputationService } from "../services/reputation.js";
import { getGameProfile } from "../services/games/profiles.js";
import { parseGameChoice } from "./game-choices.js";
import { announceResult, announceDispute } from "./notifications.js";
import { acceptButton, reportButtons } from "./buttons.js";
import { lobbyService } from "../services/lobby.js";
import { leaderboardService, type LeaderboardFilters, type RankingCategory, type TimeWindow, type GameFilter, type ModeFilter } from "../services/leaderboard.js";
import { nanoid } from "nanoid";

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  try {
    const ephemeralCommands = ["balance", "deposit", "cancel", "reputation", "link", "history", "submit", "report", "daily", "host", "lookup"];
    await interaction.deferReply({ ephemeral: ephemeralCommands.includes(commandName) });

    switch (commandName) {
      case "balance": return await handleBalance(interaction);
      case "deposit": return await handleDeposit(interaction);
      case "wager":   return await handleWager(interaction);
      case "accept":  return await handleAccept(interaction);
      case "submit":  return await handleSubmit(interaction);
      case "report":  return await handleReport(interaction);
      case "cancel":  return await handleCancel(interaction);
      case "reputation": return await handleReputation(interaction);
      case "leaderboard": return await handleLeaderboard(interaction);
      case "link":    return await handleLink(interaction);
      case "resolve": return await handleResolve(interaction);
      case "history": return await handleHistory(interaction);
      case "daily":  return await handleDaily(interaction);
      case "freeplay": return await handleFreeplay(interaction);
      case "host":   return await handleHost(interaction);
      case "lookup": return await handleLookup(interaction);
      default:
        await interaction.editReply({ content: "Unknown command." });
    }
  } catch (err: any) {
    const msg = err.message || "Something went wrong.";
    console.error(`[Bot] Command error (${commandName}):`, msg, err.stack);
    try {
      await interaction.editReply({ content: `Error: ${msg}` });
    } catch { /* expired */ }
  }
}

// ── Utility: send a message in a wager's private thread ──

async function sendToWagerThread(wager: any, content: string) {
  // Thread ID is stored in channelId after creation
  if (!wager.threadId) return;
  try {
    const { Client } = await import("discord.js");
    // We need the bot client — get it from notifications module
    const { getBotClient } = await import("./notifications.js");
    const client = getBotClient();
    if (!client) return;
    const thread = await client.channels.fetch(wager.threadId);
    if (thread?.isTextBased()) {
      await (thread as any).send(content);
    }
  } catch (err) {
    console.error("[Thread] Failed to send:", err);
  }
}

// ── Commands ──

async function handleBalance(interaction: ChatInputCommandInteraction) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const balance = await walletService.getBalance(user.id);
  await interaction.editReply({
    content: [
      `💰 **Real:** ${balance.available} available · ${balance.escrowed} escrowed`,
      `🎮 **Freeplay:** ${balance.freeplay} FP · ${balance.freeplayEscrowed} escrowed`,
    ].join("\n"),
  });
}

async function handleDeposit(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  await walletService.deposit(user.id, amount, "Demo deposit");
  const balance = await walletService.getBalance(user.id);
  await interaction.editReply({
    content: `+${amount} MP. Balance: **${balance.available}**`,
  });
}

async function handleWager(interaction: ChatInputCommandInteraction) {
  const opponent = interaction.options.getUser("opponent", true);
  const gameRaw = interaction.options.getString("game", true);
  const { franchise: game, title } = parseGameChoice(gameRaw);
  const amount = interaction.options.getInteger("amount", true);

  if (opponent.bot) return interaction.editReply({ content: "Can't wager against a bot." });
  if (opponent.id === interaction.user.id) return interaction.editReply({ content: "Can't wager against yourself." });

  const creator = await userService.ensureUser(interaction.user.id, interaction.user.username);
  await userService.ensureUser(opponent.id, opponent.username);
  const opponentUser = await userService.findByDiscordId(opponent.id);

  const wager = await wagerService.createWager(
    creator.id, opponentUser!.id, game, amount,
    interaction.guildId ?? undefined, interaction.channelId ?? undefined,
  );

  // Store title in rulesNotes if provided
  if (title) {
    await db.update(wagers).set({ rulesNotes: title }).where(eq(wagers.id, wager.id));
  }

  const profile = getGameProfile(game);
  const gameName = profile?.name ?? game.toUpperCase();
  const displayName = title ? `${gameName} — ${title}` : gameName;

  // Get rep badges for both players
  const creatorRep = await reputationService.getReputation(creator.id);
  const opponentRep = await reputationService.getReputation(opponentUser!.id);
  const creatorBadge = creatorRep ? reputationService.getRepBadge(creatorRep.reputation) : "✅ 100";
  const opponentBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  // Post a clean one-liner in the public channel with buttons
  await interaction.editReply({
    content: `⚔️ ${interaction.user} (${creatorBadge}) vs ${opponent} (${opponentBadge}) · **${displayName}** · **${amount}** MP each`,
    components: [acceptButton(wager.id)],
  });

  // DM the opponent about the challenge
  try {
    const client = (await import("./notifications.js")).getBotClient();
    if (client) {
      const opponentDiscord = await client.users.fetch(opponent.id);
      await opponentDiscord.send(`⚔️ **${interaction.user.username}** challenged you to a **${displayName}** wager for **${amount}** MP in MATCHPOINT! Check #find-match to accept.`);
    }
  } catch {}
}

async function handleAccept(interaction: ChatInputCommandInteraction) {
  const wagerId = interaction.options.getString("wager_id", true);
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.acceptWager(wagerId, user.id);
  const profile = getGameProfile(wager.game);

  await interaction.editReply({ content: "Wager accepted! Check the thread." });

  // Post report buttons in thread
  try {
    const { getBotClient } = await import("./notifications.js");
    const client = getBotClient();
    if (client && wager.channelId) {
      const thread = await client.channels.fetch(wager.channelId);
      if (thread?.isTextBased()) {
        await (thread as any).send({
          content: [
            `✅ **Match is ON!**`,
            `Both players have **${wager.amount}** MP locked.`,
            `Go play! When done, hit a button below.`,
            ``,
            `Deadline: <t:${Math.floor(wager.matchDeadline!.getTime() / 1000)}:R>`,
          ].join("\n"),
          components: [reportButtons(wager.id)],
        });
      }
    }
  } catch (err) {
    console.error("[Thread] Failed to post accept:", err);
  }
}

async function handleSubmit(interaction: ChatInputCommandInteraction) {
  const wagerId = interaction.options.getString("wager_id", true);
  const attachment = interaction.options.getAttachment("screenshot", true);
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  if (!attachment.contentType?.startsWith("image/")) {
    return interaction.editReply({ content: "Attach an image file (PNG, JPG)." });
  }

  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });
  if (wager.status !== "active" && wager.status !== "reporting") {
    return interaction.editReply({ content: "Not in a submittable state." });
  }
  if (user.id !== wager.creatorId && user.id !== wager.opponentId) {
    return interaction.editReply({ content: "You're not part of this wager." });
  }

  const existingReport = await db.select().from(matchReports)
    .where(and(eq(matchReports.wagerId, wagerId), eq(matchReports.userId, user.id)));

  if (existingReport.length > 0) {
    await db.update(matchReports)
      .set({ screenshotUrl: attachment.url, reportedAt: new Date() })
      .where(and(eq(matchReports.wagerId, wagerId), eq(matchReports.userId, user.id)));
  }

  await interaction.editReply({
    content: `Screenshot saved. Now: \`/report wager_id:${wagerId} result:win\` or \`loss\``,
  });
}

async function handleReport(interaction: ChatInputCommandInteraction) {
  const wagerId = interaction.options.getString("wager_id", true);
  const result = interaction.options.getString("result", true) as "win" | "loss";
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  const settlement = await wagerService.reportResult(wagerId, user.id, result);

  if (settlement.status === "waiting" || settlement.status === "waiting_confirm") {
    await interaction.editReply({ content: `Submitted. Waiting for your opponent.` });
  } else if (settlement.status === "settled") {
    const settledWager = await wagerService.getWager(wagerId);

    await interaction.editReply({
      content: `**Settled!** Winner gets **${settlement.winnings}** MP.`,
    });

    // Post result in thread
    try {
      const { getBotClient } = await import("./notifications.js");
      const client = getBotClient();
      if (client && settledWager?.channelId) {
        const thread = await client.channels.fetch(settledWager.channelId);
        if (thread?.isTextBased()) {
          await (thread as any).send(`🏆 **Match settled!** <@${settlement.winnerId}> wins **${settlement.winnings}** MP. Thread will archive shortly.`);
        }
      }
    } catch {}

    // Post clean one-liner in #results
    if (settledWager?.guildId) {
      const winnerDb = await db.select().from(users).where(eq(users.id, settlement.winnerId));
      const loserDb = settlement.loserId ? await db.select().from(users).where(eq(users.id, settlement.loserId)) : [];
      await announceResult(
        settledWager.guildId,
        winnerDb[0]?.discordId ?? settlement.winnerId,
        loserDb[0]?.username ?? "Unknown",
        settledWager.game,
        settlement.winnings,
        wagerId,
      );
    }
  } else if (settlement.status === "disputed") {
    const settledWager = await wagerService.getWager(wagerId);

    await interaction.editReply({
      content: `⚠️ Dispute opened — both claim victory. ID: \`${settlement.disputeId}\``,
    });

    // Post in thread
    try {
      const { getBotClient } = await import("./notifications.js");
      const client = getBotClient();
      if (client && settledWager?.channelId) {
        const thread = await client.channels.fetch(settledWager.channelId);
        if (thread?.isTextBased()) {
          await (thread as any).send(`⚠️ **Dispute opened!** Both players claim victory. A moderator will review. Submit screenshots in #evidence.`);
        }
      }
    } catch {}

    if (settledWager?.guildId) {
      await announceDispute(settledWager.guildId, wagerId, settlement.disputeId!, "Both players claim victory");
    }
  } else if (settlement.status === "refunded") {
    await interaction.editReply({ content: `Both reported a loss. Refunded.` });
  }
}

async function handleCancel(interaction: ChatInputCommandInteraction) {
  const wagerId = interaction.options.getString("wager_id", true);
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  await wagerService.cancelWager(wagerId, user.id);
  await interaction.editReply({ content: `Cancelled. MP refunded.` });
}

async function handleReputation(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const user = await userService.findByDiscordId(target.id);
  if (!user) return interaction.editReply({ content: "Not registered yet." });

  const rep = await reputationService.getReputation(user.id);
  if (!rep) return interaction.editReply({ content: "Not found." });

  const badge = reputationService.getRepBadge(rep.reputation);
  const maxWager = reputationService.getMaxWager(rep.reputation);

  await interaction.editReply({
    content: [
      `${badge} **${target.username}** · ${rep.tier}`,
      `Strikes: ${rep.strikes}/3${rep.banned ? " · **BANNED**" : ""}`,
      `Max wager: **${maxWager > 0 ? `${maxWager} MP` : "Freeplay only"}**`,
    ].join("\n"),
  });
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction) {
  const category = (interaction.options.getString("category") ?? "wins") as RankingCategory;
  const period = (interaction.options.getString("period") ?? "seasonal") as TimeWindow;
  const game = interaction.options.getString("game") as GameFilter | null;
  const mode = (interaction.options.getString("mode") ?? "real") as ModeFilter;

  const filters: LeaderboardFilters = { category, period, mode, ...(game ? { game } : {}) };

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const result = await leaderboardService.getLeaderboard(filters, user.id);
  const embed = leaderboardService.buildLeaderboardEmbed(result);

  await interaction.editReply({ embeds: [embed] });
}

async function handleLink(interaction: ChatInputCommandInteraction) {
  const platform = interaction.options.getString("platform", true);
  const platformUsername = interaction.options.getString("username", true);
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Check if this game account is linked to a banned user
  const { identityService } = await import("../services/identity.js");
  const isBanned = await identityService.isGameAccountBanned(platform, platformUsername);
  if (isBanned) {
    return interaction.editReply({
      content: "This game account is associated with a banned user and cannot be linked.",
    });
  }

  // Check if platform supports verified linking
  const {
    supportsVerification,
    createVerificationCode,
    getVerificationInstructions,
  } = await import("../services/account-verify.js");

  if (supportsVerification(platform)) {
    // Generate code and ask user to put it in their profile
    const code = createVerificationCode(user.id, platform, platformUsername);
    const instructions = getVerificationInstructions(platform, code);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
    const verifyRow = new ActionRowBuilder<typeof ButtonBuilder.prototype>().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_account:${platform}`)
        .setLabel("I've added the code — Verify")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
    );

    await interaction.editReply({
      content: instructions,
      components: [verifyRow as any],
    });
  } else {
    // Platform doesn't support verification — save directly (unverified)
    await db.insert(gameAccounts)
      .values({ id: nanoid(), userId: user.id, platform, platformUserId: platformUsername, platformUsername })
      .onConflictDoUpdate({
        target: [gameAccounts.userId, gameAccounts.platform],
        set: { platformUserId: platformUsername, platformUsername, linkedAt: new Date() },
      });

    // Assign platform role
    try {
      const { assignPlatformRole } = await import("./buttons.js");
      await assignPlatformRole(interaction, platform);
    } catch {}

    await interaction.editReply({ content: `Linked **${platform}**: ${platformUsername} (unverified)` });
  }
}

async function handleResolve(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return interaction.editReply({ content: "Need moderator permissions." });
  }
  const disputeId = interaction.options.getString("dispute_id", true);
  const outcome = interaction.options.getString("outcome", true) as "creator_wins" | "opponent_wins" | "refund";
  const mod = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const result = await wagerService.resolveDispute(disputeId, outcome, mod.id);
  await interaction.editReply({
    content: `Resolved: ${outcome.replace(/_/g, " ")}. ${result.status === "settled" ? `Winner paid ${(result as any).winnings} MP.` : "Refunded."}`,
  });

  // Archive and lock the wager thread after dispute resolution
  try {
    const { disputes } = await import("../db/schema.js");
    const [dispute] = await db.select().from(disputes).where(eq(disputes.id, disputeId));
    if (dispute) {
      const wager = await wagerService.getWager(dispute.wagerId);
      if (wager?.channelId) {
        const { getBotClient } = await import("./notifications.js");
        const client = getBotClient();
        if (client) {
          const thread = await client.channels.fetch(wager.channelId);
          if (thread?.isTextBased()) {
            await (thread as any).send(`✅ **Dispute resolved** by moderator. Outcome: ${outcome.replace(/_/g, " ")}.`);
            setTimeout(async () => {
              try {
                await (thread as any).setArchived(true);
                await (thread as any).setLocked(true);
              } catch {}
            }, 5000);
          }
        }
      }
    }
  } catch {}
}

async function handleHistory(interaction: ChatInputCommandInteraction) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const recent = await db.select().from(wagers)
    .where(sql`${wagers.creatorId} = ${user.id} OR ${wagers.opponentId} = ${user.id}`)
    .orderBy(desc(wagers.createdAt)).limit(10);

  if (recent.length === 0) return interaction.editReply({ content: "No wagers yet." });

  const lines = recent.map(w => {
    const icon = w.status === "settled" ? (w.winnerId === user.id ? "✅" : "❌") :
      w.status === "active" ? "⏳" : w.status === "disputed" ? "⚠️" : "🚫";
    return `${icon} **${w.game}** · ${w.amount} MP · ${w.status}`;
  });
  await interaction.editReply({ content: lines.join("\n") });
}

const DAILY_AMOUNT = 1000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function handleDaily(interaction: ChatInputCommandInteraction) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Check cooldown
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
  if (dbUser.lastDailyClaim) {
    const timeSince = Date.now() - dbUser.lastDailyClaim.getTime();
    if (timeSince < DAILY_COOLDOWN_MS) {
      const nextClaim = new Date(dbUser.lastDailyClaim.getTime() + DAILY_COOLDOWN_MS);
      return interaction.editReply({
        content: `Already claimed today. Next claim: <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`,
      });
    }
  }

  // Grant coins
  await walletService.addFreeplayCoins(user.id, DAILY_AMOUNT);
  await db.update(users).set({ lastDailyClaim: new Date() }).where(eq(users.id, user.id));

  const balance = await walletService.getBalance(user.id);
  await interaction.editReply({
    content: `🎁 Claimed **${DAILY_AMOUNT}** FP! Freeplay balance: **${balance.freeplay}**`,
  });
}

async function handleFreeplay(interaction: ChatInputCommandInteraction) {
  const opponent = interaction.options.getUser("opponent", true);
  const gameRaw = interaction.options.getString("game", true);
  const { franchise: game, title } = parseGameChoice(gameRaw);
  const amount = interaction.options.getInteger("amount", true);

  if (opponent.bot) return interaction.editReply({ content: "Can't wager against a bot." });
  if (opponent.id === interaction.user.id) return interaction.editReply({ content: "Can't wager against yourself." });

  const creator = await userService.ensureUser(interaction.user.id, interaction.user.username);
  await userService.ensureUser(opponent.id, opponent.username);
  const opponentUser = await userService.findByDiscordId(opponent.id);

  const wager = await wagerService.createWager(
    creator.id, opponentUser!.id, game, amount,
    interaction.guildId ?? undefined, interaction.channelId ?? undefined,
    "freeplay",
  );

  // Store title in rulesNotes if provided
  if (title) {
    await db.update(wagers).set({ rulesNotes: title }).where(eq(wagers.id, wager.id));
  }

  const profile = getGameProfile(game);
  const gameName = profile?.name ?? game.toUpperCase();
  const displayName = title ? `${gameName} — ${title}` : gameName;

  const creatorRep = await reputationService.getReputation(creator.id);
  const opponentRep = await reputationService.getReputation(opponentUser!.id);
  const creatorBadge = creatorRep ? reputationService.getRepBadge(creatorRep.reputation) : "✅ 100";
  const opponentBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  await interaction.editReply({
    content: `🎮 **FREE PLAY** · ${interaction.user} (${creatorBadge}) vs ${opponent} (${opponentBadge}) · **${displayName}** · **${amount}** FP each`,
    components: [acceptButton(wager.id)],
  });

  // DM the opponent
  try {
    const client = (await import("./notifications.js")).getBotClient();
    if (client) {
      const opponentDiscord = await client.users.fetch(opponent.id);
      await opponentDiscord.send(`🎮 **${interaction.user.username}** challenged you to a **${displayName}** freeplay match for **${amount}** FP in MATCHPOINT! Check #free-play to accept.`);
    }
  } catch {}
}

async function handleHost(interaction: ChatInputCommandInteraction) {
  const gameRaw = interaction.options.getString("game", true);
  const { franchise: game, title } = parseGameChoice(gameRaw);
  const platform = interaction.options.getString("platform", true);
  const amount = interaction.options.getInteger("amount", true);

  // Auto-detect mode from channel name
  const channelName = interaction.channel && "name" in interaction.channel ? (interaction.channel as any).name : "";
  const mode: "real" | "freeplay" = channelName === "free-play" ? "freeplay" : "real";

  const gameMode = interaction.options.getString("game_mode") ?? undefined;
  const teamSize = interaction.options.getString("team_size") ?? undefined;
  const rulesNotes = interaction.options.getString("rules_notes") ?? undefined;
  const roundsFormat = interaction.options.getString("rounds_format") ?? undefined;

  const host = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Combine title with rulesNotes if both provided
  const combinedRulesNotes = [title, rulesNotes].filter(Boolean).join(" | ") || undefined;

  const wager = await lobbyService.createLobby({
    hostId: host.id,
    game,
    platform,
    amount,
    mode,
    gameMode,
    teamSize,
    rulesNotes: combinedRulesNotes,
    roundsFormat,
    guildId: interaction.guildId ?? undefined,
  });

  // Build the lobby embed
  const hostRep = await reputationService.getReputation(host.id);
  const embed = lobbyService.buildLobbyEmbed(wager, {
    username: interaction.user.username,
    reputation: hostRep?.reputation ?? 100,
  }, "open");

  // Build Accept Match + Cancel Lobby buttons
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
  const lobbyButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_lobby:${wager.id}`)
      .setLabel("Accept Match")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️"),
    new ButtonBuilder()
      .setCustomId(`cancel_lobby:${wager.id}`)
      .setLabel("Cancel Lobby")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  // Post to the correct channel based on mode
  const targetChannelName = mode === "real" ? "find-match" : "free-play";
  const { getBotClient } = await import("./notifications.js");
  const client = getBotClient();

  if (client && interaction.guildId) {
    const guild = await client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const targetChannel = channels.find(c => c?.isTextBased() && c.name === targetChannelName) as TextChannel | undefined;

    if (targetChannel) {
      const lobbyMessage = await targetChannel.send({
        embeds: [embed],
        components: [lobbyButtons],
      });

      // Store lobbyMessageId and lobbyChannelId on the wager record
      await db.update(wagers)
        .set({ lobbyMessageId: lobbyMessage.id, lobbyChannelId: targetChannel.id })
        .where(eq(wagers.id, wager.id));
    }
  }

  const profile = getGameProfile(game);
  const gameName = profile?.name ?? game.toUpperCase();
  const displayName = title ? `${gameName} — ${title}` : gameName;
  await interaction.editReply({
    content: `✅ Lobby posted in #${targetChannelName}! **${displayName}** · **${amount}** ${mode === "real" ? "MP" : "FP"}`,
  });
}

async function handleLookup(interaction: ChatInputCommandInteraction) {
  const wagerId = interaction.options.getString("wager_id", true);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  const profile = getGameProfile(wager.game);
  const gameName = profile?.name ?? wager.game.toUpperCase();
  const isFreeplay = wager.mode === "freeplay";
  const currency = isFreeplay ? "FP" : "MP";

  // Get player names
  const [creator] = await db.select().from(users).where(eq(users.id, wager.creatorId));
  const creatorName = creator?.username ?? "Unknown";
  let opponentName = "—";
  if (wager.opponentId) {
    const [opponent] = await db.select().from(users).where(eq(users.id, wager.opponentId));
    opponentName = opponent?.username ?? "Unknown";
  }

  // Winner
  let winnerName = "—";
  if (wager.winnerId) {
    const [winner] = await db.select().from(users).where(eq(users.id, wager.winnerId));
    winnerName = winner?.username ?? "Unknown";
  }

  // Status icon
  const statusIcon = wager.status === "settled" ? "✅"
    : wager.status === "active" ? "⏳"
    : wager.status === "disputed" ? "⚠️"
    : wager.status === "cancelled" ? "🚫"
    : wager.status === "expired" ? "⏰"
    : "📋";

  // Thread link
  let threadLink = "";
  if (wager.channelId && wager.guildId) {
    threadLink = `\n🔗 [Open Thread](https://discord.com/channels/${wager.guildId}/${wager.channelId})`;
  }

  // Lobby card link
  let lobbyLink = "";
  if (wager.lobbyMessageId && wager.lobbyChannelId && wager.guildId) {
    lobbyLink = `\n📋 [Lobby Card](https://discord.com/channels/${wager.guildId}/${wager.lobbyChannelId}/${wager.lobbyMessageId})`;
  }

  // Timestamps
  const created = `<t:${Math.floor(wager.createdAt.getTime() / 1000)}:f>`;
  const settled = wager.settledAt ? `<t:${Math.floor(wager.settledAt.getTime() / 1000)}:f>` : "—";

  const lines = [
    `${statusIcon} **Wager Lookup** · \`${wagerId}\``,
    ``,
    `**Game:** ${gameName}${wager.platform ? ` · ${wager.platform}` : ""}`,
    `**Mode:** ${isFreeplay ? "🎮 Freeplay" : "💰 Real"}`,
    `**Amount:** ${wager.amount} ${currency} each`,
    `**Status:** ${wager.status}`,
    ``,
    `**Host:** ${creatorName}`,
    `**Opponent:** ${opponentName}`,
    `**Winner:** ${winnerName}`,
    ``,
    `**Created:** ${created}`,
    `**Settled:** ${settled}`,
  ];

  if (wager.gameMode) lines.push(`**Game Mode:** ${wager.gameMode}`);
  if (wager.roundsFormat) lines.push(`**Rounds:** ${wager.roundsFormat}`);
  if (wager.rulesNotes) lines.push(`**Custom Rules:** ${wager.rulesNotes}`);

  lines.push(threadLink);
  lines.push(lobbyLink);

  await interaction.editReply({ content: lines.filter(Boolean).join("\n") });
}
