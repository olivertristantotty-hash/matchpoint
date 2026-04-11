import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wagers } from "../db/schema.js";
import { userService } from "../services/user.js";
import { wagerService } from "../services/wager.js";
import { reputationService } from "../services/reputation.js";
import { getGameProfile } from "../services/games/profiles.js";
import { getBotClient, announceResult, announceDispute } from "./notifications.js";

// ── Button Builders ──

export function acceptButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept:${wagerId}`)
      .setLabel("Accept Wager")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️"),
    new ButtonBuilder()
      .setCustomId(`decline:${wagerId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function reportButtons(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`report_win:${wagerId}`)
      .setLabel("I Won")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`report_loss:${wagerId}`)
      .setLabel("I Lost")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );
}

export function disputeEvidenceButton(wagerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`evidence:${wagerId}`)
      .setLabel("I have evidence")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📸"),
  );
}

// ── Button Handler ──

export async function handleButton(interaction: ButtonInteraction) {
  const [action, param] = interaction.customId.split(":");
  if (!param) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    switch (action) {
      case "accept": return await handleAcceptButton(interaction, param);
      case "decline": return await handleDeclineButton(interaction, param);
      case "report_win": return await handleReportButton(interaction, param, "win");
      case "report_loss": return await handleReportButton(interaction, param, "loss");
      case "evidence": return await handleEvidenceButton(interaction, param);
      case "verify_account": return await handleVerifyAccountButton(interaction, param);
      default:
        await interaction.editReply({ content: "Unknown action." });
    }
  } catch (err: any) {
    console.error(`[Button] Error (${action}):`, err.message);
    try {
      await interaction.editReply({ content: `Error: ${err.message}` });
    } catch {}
  }
}

async function handleAcceptButton(interaction: ButtonInteraction, wagerId: string) {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const wager = await wagerService.acceptWager(wagerId, user.id);
  const profile = getGameProfile(wager.game);

  await interaction.editReply({ content: "Wager accepted! Check the thread." });

  // Disable the accept/decline buttons on the original message
  try {
    const msg = interaction.message;
    await msg.edit({ components: [] });
  } catch {}

  // Post in thread with report buttons
  try {
    const client = getBotClient();
    if (client && wager.channelId) {
      const thread = await client.channels.fetch(wager.channelId);
      if (thread?.isTextBased()) {
        await (thread as any).send({
          content: [
            `✅ **Match is ON!**`,
            `Both players have **${wager.amount}** tokens locked.`,
            ``,
            `Go play your match. When it's done, hit the button below:`,
            ``,
            `Deadline: <t:${Math.floor(wager.matchDeadline!.getTime() / 1000)}:R>`,
          ].join("\n"),
          components: [reportButtons(wagerId)],
        });
      }
    }
  } catch (err) {
    console.error("[Button] Failed to post report buttons:", err);
  }
}

async function handleDeclineButton(interaction: ButtonInteraction, wagerId: string) {
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return interaction.editReply({ content: "Wager not found." });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  if (user.id !== wager.opponentId) {
    return interaction.editReply({ content: "Only the challenged player can decline." });
  }

  if (wager.status !== "pending") {
    return interaction.editReply({ content: "This wager is no longer pending." });
  }

  await wagerService.cancelWager(wagerId, wager.creatorId);

  // Disable buttons
  try {
    await interaction.message.edit({
      content: interaction.message.content + "\n\n~~Declined~~",
      components: [],
    });
  } catch {}

  await interaction.editReply({ content: "Wager declined." });

  // Notify in thread
  try {
    const client = getBotClient();
    if (client && wager.channelId) {
      const thread = await client.channels.fetch(wager.channelId);
      if (thread?.isTextBased()) {
        await (thread as any).send("❌ Wager declined. Tokens refunded. Thread will archive.");
      }
    }
  } catch {}
}

async function handleReportButton(interaction: ButtonInteraction, wagerId: string, result: "win" | "loss") {
  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const settlement = await wagerService.reportResult(wagerId, user.id, result);

  if (settlement.status === "waiting_confirm") {
    // First report — notify opponent they have 15 min
    const deadline = (settlement as any).confirmDeadline as Date;
    await interaction.editReply({
      content: `Recorded: you ${result === "win" ? "won" : "lost"}. Opponent has 15 minutes to confirm.`,
    });

    // Post countdown in thread
    try {
      const client = getBotClient();
      const wager = await wagerService.getWager(wagerId);
      if (client && wager?.channelId) {
        const thread = await client.channels.fetch(wager.channelId);
        const otherDiscordId = user.id === wager.creatorId
          ? (await db.select().from(users).where(eq(users.id, wager.opponentId!)))[0]?.discordId
          : (await db.select().from(users).where(eq(users.id, wager.creatorId)))[0]?.discordId;

        if (thread?.isTextBased()) {
          await (thread as any).send({
            content: [
              `📋 **${interaction.user.username}** reported: **${result.toUpperCase()}**`,
              ``,
              otherDiscordId ? `<@${otherDiscordId}>, you have **15 minutes** to confirm or dispute.` : `Opponent has **15 minutes** to respond.`,
              `If no response by <t:${Math.floor(deadline.getTime() / 1000)}:R>, this result will be **auto-confirmed**.`,
            ].join("\n"),
            components: [reportButtons(wagerId)],
          });
        }
      }
    } catch {}
  } else if (settlement.status === "waiting") {
    await interaction.editReply({ content: `Recorded. Waiting for the other player.` });
  } else if (settlement.status === "settled") {
    await interaction.editReply({ content: `Settled! Winner gets **${settlement.winnings}** tokens.` });

    // Disable report buttons
    try { await interaction.message.edit({ components: [] }); } catch {}

    const settledWager = await wagerService.getWager(wagerId);

    // Post in thread
    try {
      const client = getBotClient();
      if (client && settledWager?.channelId) {
        const thread = await client.channels.fetch(settledWager.channelId);
        if (thread?.isTextBased()) {
          await (thread as any).send(`🏆 **Match settled!** <@${settlement.winnerId}> wins **${settlement.winnings}** tokens.`);
        }
      }
    } catch {}

    // Post in #results
    if (settledWager?.guildId) {
      const winnerDb = await db.select().from(users).where(eq(users.id, settlement.winnerId));
      const loserDb = settlement.loserId ? await db.select().from(users).where(eq(users.id, settlement.loserId)) : [];
      await announceResult(
        settledWager.guildId,
        winnerDb[0]?.discordId ?? settlement.winnerId,
        loserDb[0]?.username ?? "Unknown",
        settledWager.game,
        settlement.winnings,
      );
    }

    // Auto-role check for both players
    await checkAndAssignRoles(settledWager);
  } else if (settlement.status === "disputed") {
    await interaction.editReply({ content: `⚠️ Dispute opened — both claim victory.` });

    try { await interaction.message.edit({ components: [] }); } catch {}

    const settledWager = await wagerService.getWager(wagerId);

    // Post dispute info in thread with evidence button
    try {
      const client = getBotClient();
      if (client && settledWager?.channelId) {
        const thread = await client.channels.fetch(settledWager.channelId);
        if (thread?.isTextBased()) {
          await (thread as any).send({
            content: [
              `⚠️ **Dispute!** Both players claim victory.`,
              ``,
              `Post your evidence here — screenshot, clip, photo of your screen, anything.`,
              `A moderator will review and decide.`,
            ].join("\n"),
            components: [disputeEvidenceButton(wagerId)],
          });
        }
      }
    } catch {}

    if (settledWager?.guildId) {
      await announceDispute(settledWager.guildId, wagerId, settlement.disputeId!, "Both players claim victory");
    }
  } else if (settlement.status === "refunded") {
    await interaction.editReply({ content: `Both reported a loss. Refunded.` });
    try { await interaction.message.edit({ components: [] }); } catch {}
  }
}

async function handleEvidenceButton(interaction: ButtonInteraction, wagerId: string) {
  await interaction.editReply({
    content: `Post your evidence (screenshot, photo, clip) right here in this thread. A mod will review it.`,
  });
}

// ── Auto-Role Assignment ──

async function checkAndAssignRoles(wager: any) {
  if (!wager?.guildId) return;

  const client = getBotClient();
  if (!client) return;

  try {
    const guild = await client.guilds.fetch(wager.guildId);

    // Check both players
    for (const userId of [wager.creatorId, wager.opponentId]) {
      if (!userId) continue;

      const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!dbUser) continue;

      const member = await guild.members.fetch(dbUser.discordId).catch(() => null);
      if (!member) continue;

      // @Verified — after first completed wager
      const verifiedRole = guild.roles.cache.find(r => r.name === "Verified");
      if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
        await member.roles.add(verifiedRole);
        console.log(`[Roles] Assigned @Verified to ${dbUser.username}`);
      }

      // @Trusted — reputation >= 150
      const trustedRole = guild.roles.cache.find(r => r.name === "Trusted");
      if (trustedRole && dbUser.reputation >= 150 && !member.roles.cache.has(trustedRole.id)) {
        await member.roles.add(trustedRole);
        console.log(`[Roles] Assigned @Trusted to ${dbUser.username}`);
      }
    }
  } catch (err) {
    console.error("[Roles] Failed to assign:", err);
  }
}

// ── Account Verification Button ──

async function handleVerifyAccountButton(interaction: ButtonInteraction, platform: string) {
  const {
    getPendingVerification,
    clearPendingVerification,
    verifySteamProfile,
    verifyXboxProfile,
  } = await import("../services/account-verify.js");
  const { nanoid } = await import("nanoid");

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const pending = getPendingVerification(user.id, platform);

  if (!pending) {
    return interaction.editReply({
      content: "Verification expired or not found. Use `/link` again to start over.",
    });
  }

  // Check the profile for the code
  let found = false;

  if (platform === "steam") {
    found = await verifySteamProfile(pending.platformUsername, pending.code);
  } else if (platform === "xbox") {
    found = await verifyXboxProfile(pending.platformUsername, pending.code);
  }

  if (!found) {
    return interaction.editReply({
      content: `Code \`${pending.code}\` not found on your ${platform} profile. Make sure you saved it and try again. The code is case-sensitive.`,
    });
  }

  // Verified — save the linked account
  const { gameAccounts } = await import("../db/schema.js");

  await db.insert(gameAccounts)
    .values({
      id: nanoid(),
      userId: user.id,
      platform,
      platformUserId: pending.platformUsername,
      platformUsername: pending.platformUsername,
    })
    .onConflictDoUpdate({
      target: [gameAccounts.userId, gameAccounts.platform],
      set: {
        platformUserId: pending.platformUsername,
        platformUsername: pending.platformUsername,
        linkedAt: new Date(),
      },
    });

  clearPendingVerification(user.id, platform);

  // Disable the verify button
  try {
    await interaction.message.edit({ components: [] });
  } catch {}

  // Assign platform role
  await assignPlatformRole(interaction, platform);

  await interaction.editReply({
    content: `✅ **Verified!** Your ${platform} account **${pending.platformUsername}** is now linked. You can remove the code from your profile.`,
  });
}

// ── Platform Role Assignment ──

const PLATFORM_ROLES: Record<string, string> = {
  steam: "Steam Verified",
  xbox: "Xbox Verified",
  riot: "Riot Linked",
  ea: "EA Linked",
  epic: "Epic Linked",
  activision: "Activision Linked",
};

export async function assignPlatformRole(interaction: ButtonInteraction | any, platform: string) {
  const roleName = PLATFORM_ROLES[platform];
  if (!roleName) return;

  try {
    const client = getBotClient();
    if (!client) return;

    const guild = interaction.guild ?? (interaction.guildId ? await client.guilds.fetch(interaction.guildId) : null);
    if (!guild) return;

    const role = guild.roles.cache.find((r: any) => r.name === roleName);
    if (!role) {
      console.log(`[Roles] Role "${roleName}" not found in guild`);
      return;
    }

    const member = await guild.members.fetch(interaction.user.id);
    if (member && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      console.log(`[Roles] Assigned @${roleName} to ${interaction.user.username}`);
    }
  } catch (err) {
    console.error(`[Roles] Failed to assign @${roleName}:`, err);
  }
}
