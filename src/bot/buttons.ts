import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChannelType,
  TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wagers } from "../db/schema.js";
import { userService } from "../services/user.js";
import { wagerService } from "../services/wager.js";
import { reputationService } from "../services/reputation.js";
import { getGameProfile } from "../services/games/profiles.js";
import { lobbyService } from "../services/lobby.js";
import { getBotClient, announceResult, announceDispute } from "./notifications.js";

// ── State Tracking ──
const readyPlayers = new Map<string, Set<string>>();
const matchOverPlayers = new Map<string, Set<string>>();
const rulesConfirmed = new Map<string, Set<string>>();

// ── Button Builders ──

export function acceptButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`accept:${wagerId}`).setLabel("Accept Wager").setStyle(ButtonStyle.Success).setEmoji("⚔️"),
    new ButtonBuilder().setCustomId(`decline:${wagerId}`).setLabel("Decline").setStyle(ButtonStyle.Secondary),
  );
}

export function confirmRulesButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`confirm_rules:${wagerId}`).setLabel("Confirm Rules").setStyle(ButtonStyle.Success).setEmoji("✅"),
  );
}

export function readyButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ready:${wagerId}`).setLabel("I'm Ready").setStyle(ButtonStyle.Success).setEmoji("🎮"),
  );
}

export function matchOverButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`match_over:${wagerId}`).setLabel("Match Over").setStyle(ButtonStyle.Primary).setEmoji("🎬"),
  );
}

export function quickSettleButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`quick_settle:${wagerId}`).setLabel("Quick Settle").setStyle(ButtonStyle.Primary).setEmoji("⚡"),
  );
}

export function cancelMatchButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cancel_match:${wagerId}`).setLabel("Cancel Match").setStyle(ButtonStyle.Danger).setEmoji("🚫"),
  );
}

export function reportButtons(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`report_win:${wagerId}`).setLabel("I Won").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(`report_loss:${wagerId}`).setLabel("I Lost").setStyle(ButtonStyle.Danger).setEmoji("❌"),
  );
}

// ── Helpers ──

async function log(threadId: string, message: string) {
  try {
    const client = getBotClient();
    if (!client) return;
    const thread = await client.channels.fetch(threadId);
    if (thread?.isTextBased()) {
      const ts = `<t:${Math.floor(Date.now() / 1000)}:T>`;
      await (thread as any).send(`${ts} ${message}`);
    }
  } catch {}
}

async function getThread(channelId: string | null) {
  if (!channelId) return null;
  const client = getBotClient();
  if (!client) return null;
  const ch = await client.channels.fetch(channelId);
  return ch?.isTextBased() ? ch : null;
}

async function dmUser(discordId: string, content: string) {
  try {
    const client = getBotClient();
    if (!client) return;
    const user = await client.users.fetch(discordId);
    await user.send(content);
  } catch {}
}

// ── Main Handler ──

export async function handleButton(interaction: ButtonInteraction) {
  const [action, param] = interaction.customId.split(":");
  if (!param) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    switch (action) {
      case "accept": return await onAccept(interaction, param);
      case "decline": return await onDecline(interaction, param);
      case "accept_lobby": return await onAcceptLobby(interaction, param);
      case "cancel_lobby": return await onCancelLobby(interaction, param);
      case "cancel_match": return await onCancelMatch(interaction, param);
      case "confirm_rules": return await onConfirmRules(interaction, param);
      case "ready": return await onReady(interaction, param);
      case "match_over": return await onMatchOver(interaction, param);
      case "quick_settle": return await onQuickSettle(interaction, param);
      case "report_win": return await onReport(interaction, param, "win");
      case "report_loss": return await onReport(interaction, param, "loss");
      case "verify_account": return await onVerifyAccount(interaction, param);
      default:
        await interaction.editReply({ content: "Unknown action." });
    }
  } catch (err: any) {
    console.error(`[Button] Error (${action}):`, err.message);
    try { await interaction.editReply({ content: `Error: ${err.message}` }); } catch {}
  }
}

// ── Step 1: ACCEPT ──

async function onAccept(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.acceptWager(wagerId, user.id);
  const profile = getGameProfile(wager.game);
  const gameName = profile?.name ?? wager.game.toUpperCase();

  await interaction.editReply({ content: "Accepted! Thread opening..." });
  try { await interaction.message.edit({ components: [] }); } catch {}

  // Get creator info
  const [creator] = await db.select().from(users).where(eq(users.id, wager.creatorId));
  const creatorRep = await reputationService.getReputation(wager.creatorId);
  const opponentRep = await reputationService.getReputation(user.id);
  const cBadge = creatorRep ? reputationService.getRepBadge(creatorRep.reputation) : "✅ 100";
  const oBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  // Create thread
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const thread = await (channel as TextChannel).threads.create({
    name: `${creator.username} vs ${interaction.user.username} · ${gameName}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    type: ChannelType.PrivateThread,
    reason: `Wager ${wager.id}`,
  });

  await thread.members.add(creator.discordId);
  await thread.members.add(interaction.user.id);
  await db.update(wagers).set({ channelId: thread.id }).where(eq(wagers.id, wagerId));

  const isFreeplay = wager.mode === "freeplay";
  const currency = isFreeplay ? "FP" : "MP";
  const feeInfo = isFreeplay ? "No fees" : `Fee: ${wager.fee} · Winner gets: ${wager.amount * 2 - wager.fee}`;

  // Log: wager created
  const ts = `<t:${Math.floor(Date.now() / 1000)}:T>`;
  await thread.send([
    `${ts} ⚔️ **Wager opened**`,
    `<@${creator.discordId}> (${cBadge}) vs <@${interaction.user.id}> (${oBadge})`,
    `**${gameName}** · ${wager.amount} ${currency} each · ${feeInfo}`,
    `${isFreeplay ? "🎮 Freeplay" : "💰 Real wager"} · ID: \`${wagerId}\``,
  ].join("\n"));

  // Post game rules
  const rulesBlock = profile
    ? profile.rules.map(r => `• ${r}`).join("\n")
    : "• No preset rules for this game.";

  await thread.send([
    `**Game Rules:**`,
    rulesBlock,
    ``,
    `**Custom rules?** Type them in this thread now. When you're both happy with the rules, click Confirm.`,
  ].join("\n"));

  await thread.send({
    content: `Both players must confirm rules before the match starts:`,
    components: [confirmRulesButton(wagerId)],
  });

  // DM the creator that their wager was accepted
  await dmUser(creator.discordId, `⚔️ **${interaction.user.username}** accepted your ${gameName} wager for ${wager.amount} ${currency}! Check the thread in MATCHPOINT.`);
}

// ── Step 1b: DECLINE ──

async function onDecline(interaction: ButtonInteraction, wagerId: string) {
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  if (user.id !== wager.opponentId) return interaction.editReply({ content: "Only the challenged player can decline." });
  if (wager.status !== "pending") return interaction.editReply({ content: "No longer pending." });

  await wagerService.cancelWager(wagerId, wager.creatorId);
  try { await interaction.message.edit({ content: interaction.message.content + "\n~~Declined~~", components: [] }); } catch {}
  await interaction.editReply({ content: "Declined." });

  // DM creator
  const [creator] = await db.select().from(users).where(eq(users.id, wager.creatorId));
  if (creator) await dmUser(creator.discordId, `❌ **${interaction.user.username}** declined your wager. MP refunded.`);
}

// ── Step 2: CONFIRM RULES ──

async function onConfirmRules(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  if (user.id !== wager.creatorId && user.id !== wager.opponentId) {
    return interaction.editReply({ content: "Not part of this wager." });
  }

  if (!rulesConfirmed.has(wagerId)) rulesConfirmed.set(wagerId, new Set());
  rulesConfirmed.get(wagerId)!.add(user.id);

  const confirmed = rulesConfirmed.get(wagerId)!;
  const both = confirmed.has(wager.creatorId) && confirmed.has(wager.opponentId!);

  if (!both) {
    await interaction.editReply({ content: "Rules confirmed. Waiting for opponent..." });
    await log(wager.channelId!, `✅ **${interaction.user.username}** confirmed rules.`);
    return;
  }

  rulesConfirmed.delete(wagerId);
  await interaction.editReply({ content: "Both confirmed!" });
  try { await interaction.message.edit({ components: [] }); } catch {}

  await log(wager.channelId!, `✅ **Rules confirmed by both players.**`);

  const thread = await getThread(wager.channelId);
  if (thread) {
    await (thread as any).send({
      content: `**Ready to play?** Both players click when you're in the game lobby:`,
      components: [readyButton(wagerId)],
    });
  }
}

// ── Step 3: READY ──

async function onReady(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  if (!readyPlayers.has(wagerId)) readyPlayers.set(wagerId, new Set());
  readyPlayers.get(wagerId)!.add(user.id);

  const ready = readyPlayers.get(wagerId)!;
  const both = ready.has(wager.creatorId) && ready.has(wager.opponentId!);

  if (!both) {
    await interaction.editReply({ content: "Ready! Waiting for opponent..." });
    await log(wager.channelId!, `🎮 **${interaction.user.username}** is ready.`);
    return;
  }

  readyPlayers.delete(wagerId);
  await interaction.editReply({ content: "Both ready! Match is live." });
  try { await interaction.message.edit({ components: [] }); } catch {}

  await log(wager.channelId!, `🎮 **Both players ready. Match is LIVE.**`);

  const thread = await getThread(wager.channelId);
  if (thread) {
    await (thread as any).send({
      content: [
        `**Match is live!** Good luck.`,
        ``,
        `When the match ends, click below:`,
        `Deadline: <t:${Math.floor(wager.matchDeadline!.getTime() / 1000)}:R>`,
      ].join("\n"),
      components: [matchOverButton(wagerId)],
    });
  }
}

// ── Step 4: MATCH OVER ──

async function onMatchOver(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  if (!matchOverPlayers.has(wagerId)) matchOverPlayers.set(wagerId, new Set());
  matchOverPlayers.get(wagerId)!.add(user.id);

  const confirmed = matchOverPlayers.get(wagerId)!;
  const both = confirmed.has(wager.creatorId) && confirmed.has(wager.opponentId!);

  if (!both) {
    await interaction.editReply({ content: "Confirmed. Waiting for opponent..." });
    await log(wager.channelId!, `🎬 **${interaction.user.username}** confirmed match over.`);
    return;
  }

  matchOverPlayers.delete(wagerId);
  await interaction.editReply({ content: "Both confirmed." });
  try { await interaction.message.edit({ components: [] }); } catch {}

  await log(wager.channelId!, `🎬 **Match over confirmed by both players.**`);

  // Try Medal clips
  try {
    const { verifyWithMedal } = await import("../services/medal-verify.js");
    const medalResult = await verifyWithMedal(wagerId);
    if (medalResult.creatorClip || medalResult.opponentClip) {
      await db.update(wagers).set({
        creatorClipUrl: medalResult.creatorClip?.directClipUrl ?? null,
        opponentClipUrl: medalResult.opponentClip?.directClipUrl ?? null,
      }).where(eq(wagers.id, wagerId));

      const clipLines = [
        medalResult.creatorClip ? `📎 ${medalResult.creatorClip.directClipUrl}` : null,
        medalResult.opponentClip ? `📎 ${medalResult.opponentClip.directClipUrl}` : null,
      ].filter(Boolean).join("\n");
      await log(wager.channelId!, `🎬 Medal clips found:\n${clipLines}`);
    }
  } catch {}

  const thread = await getThread(wager.channelId);
  if (thread) {
    await (thread as any).send({
      content: [
        `📸 **Drop your score screen screenshot in this thread now.**`,
        `No screenshot in a dispute = you lose.`,
        ``,
        `When ready to settle:`,
      ].join("\n"),
      components: [quickSettleButton(wagerId)],
    });

    // Auto-save any screenshots dropped
    const filter = (m: any) => !m.author.bot && m.attachments.size > 0;
    const collector = (thread as any).createMessageCollector({ filter, time: 600000 });
    collector.on("collect", async (m: any) => {
      try {
        const url = m.attachments.first()?.url;
        if (!url) return;
        const msgUser = await userService.findByDiscordId(m.author.id);
        if (!msgUser) return;
        const isCreator = msgUser.id === wager.creatorId;

        // Check if this player already submitted evidence
        const currentWager = await wagerService.getWager(wagerId);
        if (isCreator && currentWager?.creatorClipUrl) {
          await m.reply({ content: "You've already submitted your evidence. Only one submission allowed.", ephemeral: false });
          return;
        }
        if (!isCreator && currentWager?.opponentClipUrl) {
          await m.reply({ content: "You've already submitted your evidence. Only one submission allowed.", ephemeral: false });
          return;
        }

        await db.update(wagers).set(
          isCreator ? { creatorClipUrl: url } : { opponentClipUrl: url }
        ).where(eq(wagers.id, wagerId));
        await log(wager.channelId!, `📸 Evidence saved from **${m.author.username}**. (1 submission only — this is your final evidence)`);
      } catch {}
    });
  }
}

// ── Step 5: QUICK SETTLE ──

async function onQuickSettle(interaction: ButtonInteraction, wagerId: string) {
  await interaction.editReply({ content: "Blind report — neither sees the other's answer." });
  try { await interaction.message.edit({ components: [] }); } catch {}

  const wager = await wagerService.getWager(wagerId);
  await log(wager?.channelId!, `⚡ **Quick settle initiated.**`);

  const thread = await getThread(wager?.channelId ?? null);
  if (thread) {
    await (thread as any).send({
      content: `**Report the result:**`,
      components: [reportButtons(wagerId)],
    });
  }
}

// ── Step 6: REPORT ──

async function onReport(interaction: ButtonInteraction, wagerId: string, result: "win" | "loss") {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const settlement = await wagerService.reportResult(wagerId, user.id, result);
  const wager = await wagerService.getWager(wagerId);

  if (settlement.status === "waiting_confirm" || settlement.status === "waiting") {
    await interaction.editReply({ content: "Submitted. Waiting for opponent." });
    await log(wager?.channelId!, `📋 **${interaction.user.username}** submitted their result.`);

    // Notify opponent
    const otherUserId = user.id === wager?.creatorId ? wager?.opponentId : wager?.creatorId;
    if (otherUserId) {
      const [other] = await db.select().from(users).where(eq(users.id, otherUserId));
      if (other) {
        await log(wager?.channelId!, `⏳ <@${other.discordId}>, your turn. 15 minutes to respond.`);
      }
    }
  } else if (settlement.status === "settled") {
    await interaction.editReply({ content: `Settled!` });
    try { await interaction.message.edit({ components: [] }); } catch {}

    const [winner] = await db.select().from(users).where(eq(users.id, settlement.winnerId));
    const [loser] = settlement.loserId ? await db.select().from(users).where(eq(users.id, settlement.loserId)) : [null];

    await log(wager?.channelId!, `🏆 **Match settled!** <@${winner?.discordId}> wins **${settlement.winnings}** ${wager?.mode === "freeplay" ? "FP" : "MP"}.`);

    // Announce in #results with clips
    if (wager?.guildId) {
      const updatedWager = await wagerService.getWager(wagerId);
      await announceResult(
        wager.guildId,
        winner?.discordId ?? settlement.winnerId,
        loser?.username ?? "Unknown",
        wager.game,
        settlement.winnings,
        wagerId,
        undefined,
        { creator: updatedWager?.creatorClipUrl, opponent: updatedWager?.opponentClipUrl },
      );
    }

    // Auto-roles
    await checkAndAssignRoles(wager);

    // Archive and lock the thread after settlement
    try {
      const thread = await getThread(wager?.channelId ?? null);
      if (thread) {
        // Give players a moment to see the result
        setTimeout(async () => {
          try {
            await (thread as any).setArchived(true);
            await (thread as any).setLocked(true);
          } catch {}
        }, 10000); // 10 second delay
      }
    } catch {}

  } else if (settlement.status === "disputed") {
    await interaction.editReply({ content: "Dispute opened." });
    try { await interaction.message.edit({ components: [] }); } catch {}

    await log(wager?.channelId!, `⚠️ **DISPUTE** — both players claim victory. Post your screenshot evidence above. A mod will review.`);

    if (wager?.guildId) {
      await announceDispute(wager.guildId, wagerId, settlement.disputeId!, "Both players claim victory");
    }

    await log(wager?.channelId!, `📸 **You have 5 minutes to submit your evidence.** Drop ONE screenshot or clip each. The bot will review after the timer expires.`);
  } else if (settlement.status === "refunded") {
    await interaction.editReply({ content: "Refunded." });
    try { await interaction.message.edit({ components: [] }); } catch {}
    await log(wager?.channelId!, `💸 **Refunded** — both reported a loss.`);

    // Archive and lock the thread after refund
    try {
      const thread = await getThread(wager?.channelId ?? null);
      if (thread) {
        // Give players a moment to see the result
        setTimeout(async () => {
          try {
            await (thread as any).setArchived(true);
            await (thread as any).setLocked(true);
          } catch {}
        }, 10000); // 10 second delay
      }
    } catch {}
  }
}

// ── Lobby: ACCEPT LOBBY ──

async function onAcceptLobby(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await lobbyService.acceptLobby(wagerId, user.id, interaction.guildId ?? "");

  // Get host info
  const [host] = await db.select().from(users).where(eq(users.id, wager.creatorId));
  const hostRep = await reputationService.getReputation(wager.creatorId);
  const opponentRep = await reputationService.getReputation(user.id);

  // Delete the lobby listing from the channel to keep #find-match clean
  try {
    await interaction.message.delete();
  } catch {}

  await interaction.editReply({ content: "Match accepted! Thread opening..." });

  // Create private thread
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const profile = getGameProfile(wager.game);
  const gameName = profile?.name ?? wager.game.toUpperCase();

  const thread = await (channel as TextChannel).threads.create({
    name: `${host.username} vs ${interaction.user.username} — ${gameName}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    type: ChannelType.PrivateThread,
    reason: `Lobby wager ${wager.id}`,
  });

  await thread.members.add(host.discordId);
  await thread.members.add(interaction.user.id);
  await db.update(wagers).set({ channelId: thread.id }).where(eq(wagers.id, wagerId));

  const isFreeplay = wager.mode === "freeplay";
  const currency = isFreeplay ? "FP" : "MP";
  const feeInfo = isFreeplay ? "No fees" : `Fee: ${wager.fee} · Winner gets: ${wager.amount * 2 - wager.fee}`;
  const cBadge = hostRep ? reputationService.getRepBadge(hostRep.reputation) : "✅ 100";
  const oBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  // Post match details
  await thread.send([
    `⚔️ **Match Details**`,
    `<@${host.discordId}> (${cBadge}) vs <@${interaction.user.id}> (${oBadge})`,
    `**${gameName}** · ${wager.amount} ${currency} each · ${feeInfo}`,
    `${isFreeplay ? "🎮 Freeplay" : "💰 Real wager"} · ID: \`${wagerId}\``,
    ``,
    `Both players have agreed to the rules by accepting the match.`,
  ].join("\n"));

  // Post game rules
  const rulesBlock = profile
    ? profile.rules.map(r => `• ${r}`).join("\n")
    : "• No preset rules for this game.";

  let rulesMessage = `**Game Rules:**\n${rulesBlock}`;
  if (wager.rulesNotes) {
    rulesMessage += `\n\n**Custom Rules:** ${wager.rulesNotes}`;
  }
  await thread.send(rulesMessage);

  // Post Ready + Cancel Match buttons
  const readyCancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ready:${wagerId}`).setLabel("I'm Ready").setStyle(ButtonStyle.Success).setEmoji("🎮"),
    new ButtonBuilder().setCustomId(`cancel_match:${wagerId}`).setLabel("Cancel Match").setStyle(ButtonStyle.Danger).setEmoji("🚫"),
  );
  await thread.send({
    content: `Click **Ready** when you're in the game lobby. Either player can cancel before both are ready.`,
    components: [readyCancelRow],
  });

  // DM host that lobby was accepted
  await dmUser(host.discordId, `⚔️ **${interaction.user.username}** accepted your ${gameName} lobby for ${wager.amount} ${currency}! Check the thread in MATCHPOINT.`);
}

// ── Lobby: CANCEL LOBBY ──

async function onCancelLobby(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  // Verify user is the host
  const [host] = await db.select().from(users).where(eq(users.id, wager.creatorId));
  if (!host || host.discordId !== interaction.user.id) {
    return interaction.editReply({ content: "Only the host can cancel this lobby." });
  }

  await lobbyService.cancelLobby(wagerId, user.id);

  // Delete the lobby listing from the channel
  try {
    await interaction.message.delete();
  } catch {}

  await interaction.editReply({ content: "Lobby cancelled. MP refunded." });
}

// ── Lobby: CANCEL MATCH ──

async function onCancelMatch(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  if (user.id !== wager.creatorId && user.id !== wager.opponentId) {
    return interaction.editReply({ content: "You're not part of this wager." });
  }

  // Check fewer than 2 players ready
  const ready = readyPlayers.get(wagerId);
  if (ready && ready.has(wager.creatorId) && ready.has(wager.opponentId!)) {
    return interaction.editReply({ content: "Both players are already ready. Cannot cancel." });
  }

  // Refund both players
  await wagerService.refundWager(wagerId, `Cancelled by ${interaction.user.username}`);
  readyPlayers.delete(wagerId);

  await interaction.editReply({ content: "Match cancelled. Both players refunded." });

  // Post cancellation message in thread
  const thread = await getThread(wager.channelId);
  if (thread) {
    await (thread as any).send(`🚫 **Match cancelled** by **${interaction.user.username}**. Both players have been refunded.`);
    // Disable buttons
    try { await interaction.message.edit({ components: [] }); } catch {}
    // Archive thread
    try { await (thread as any).setArchived(true); } catch {}
  }
}

// ── Account Verification ──

async function onVerifyAccount(interaction: ButtonInteraction, platform: string) {
  const { getPendingVerification, clearPendingVerification, verifySteamProfile, verifyXboxProfile } = await import("../services/account-verify.js");
  const { nanoid } = await import("nanoid");
  const { gameAccounts } = await import("../db/schema.js");

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const pending = getPendingVerification(user.id, platform);
  if (!pending) return interaction.editReply({ content: "Verification expired. Use `/link` again." });

  let found = false;
  if (platform === "steam") found = await verifySteamProfile(pending.platformUsername, pending.code);
  else if (platform === "xbox") found = await verifyXboxProfile(pending.platformUsername, pending.code);

  if (!found) return interaction.editReply({ content: `Code \`${pending.code}\` not found. Make sure you saved it and your profile is public.` });

  await db.insert(gameAccounts)
    .values({ id: nanoid(), userId: user.id, platform, platformUserId: pending.platformUsername, platformUsername: pending.platformUsername })
    .onConflictDoUpdate({ target: [gameAccounts.userId, gameAccounts.platform], set: { platformUserId: pending.platformUsername, platformUsername: pending.platformUsername, linkedAt: new Date() } });

  clearPendingVerification(user.id, platform);
  try { await interaction.message.edit({ components: [] }); } catch {}
  await assignPlatformRole(interaction, platform);
  await interaction.editReply({ content: `✅ **Verified!** ${platform} account **${pending.platformUsername}** linked.` });
}

// ── Auto-Role Assignment ──

async function checkAndAssignRoles(wager: any) {
  if (!wager?.guildId) return;
  const client = getBotClient();
  if (!client) return;

  try {
    const guild = await client.guilds.fetch(wager.guildId);
    for (const userId of [wager.creatorId, wager.opponentId]) {
      if (!userId) continue;
      const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!dbUser) continue;
      const member = await guild.members.fetch(dbUser.discordId).catch(() => null);
      if (!member) continue;

      const verifiedRole = guild.roles.cache.find(r => r.name === "Verified");
      if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
        await member.roles.add(verifiedRole);
      }
      const trustedRole = guild.roles.cache.find(r => r.name === "Trusted");
      if (trustedRole && dbUser.reputation >= 150 && !member.roles.cache.has(trustedRole.id)) {
        await member.roles.add(trustedRole);
      }
    }
  } catch {}
}

// ── Platform Roles ──

const PLATFORM_ROLES: Record<string, string> = {
  steam: "Steam Verified", xbox: "Xbox Verified", riot: "Riot Linked",
  ea: "EA Linked", epic: "Epic Linked", activision: "Activision Linked", medal: "Medal Linked",
};

export async function assignPlatformRole(interaction: ButtonInteraction | any, platform: string) {
  const roleName = PLATFORM_ROLES[platform];
  if (!roleName) return;
  try {
    const client = getBotClient();
    if (!client) return;
    const guild = interaction.guild ?? (interaction.guildId ? await client.guilds.fetch(interaction.guildId) : null);
    if (!guild) return;
    await guild.roles.fetch();
    const role = guild.roles.cache.find((r: any) => r.name === roleName);
    if (!role) return;
    const member = await guild.members.fetch(interaction.user.id);
    if (member && !member.roles.cache.has(role.id)) await member.roles.add(role);
  } catch {}
}
