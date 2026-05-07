import {
  UserContextMenuCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { userService } from "../services/user.js";
import { walletService } from "../services/wallet.js";
import { wagerService } from "../services/wager.js";
import { reputationService } from "../services/reputation.js";
import { getGameProfile } from "../services/games/profiles.js";
import { acceptButton } from "./buttons.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wagers } from "../db/schema.js";
import {
  ChannelType,
  TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";

// ── Platform options shared across flows ──

const PLATFORM_OPTIONS = [
  { label: "PC", value: "pc", emoji: "🖥️" },
  { label: "PlayStation", value: "playstation", emoji: "🎮" },
  { label: "Xbox", value: "xbox", emoji: "🟢" },
  { label: "Nintendo Switch", value: "switch", emoji: "🔴" },
  { label: "Cross-Platform", value: "crossplay", emoji: "🌐" },
];

export async function handleContextMenu(interaction: UserContextMenuCommandInteraction) {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case "Challenge to Wager":
        return await handleChallengeContext(interaction, "real");
      case "Freeplay Challenge":
        return await handleChallengeContext(interaction, "freeplay");
      case "View Reputation":
        return await handleViewRepContext(interaction);
    }
  } catch (err: any) {
    console.error("[ContextMenu] Error:", err.message);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Error: ${err.message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
      }
    } catch {}
  }
}

// ── Step 1: Pick a franchise ──

async function handleChallengeContext(interaction: UserContextMenuCommandInteraction, mode: "real" | "freeplay") {
  const target = interaction.targetUser;

  if (target.bot) {
    return interaction.reply({ content: "Can't wager against a bot.", ephemeral: true });
  }
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "Can't wager against yourself.", ephemeral: true });
  }

  const prefix = mode === "freeplay" ? "fp_game" : "wager_game";

  const gameSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${prefix}:${target.id}`)
      .setPlaceholder("Pick a game franchise")
      .addOptions(
        { label: "FIFA / EA FC", value: "fifa", emoji: "⚽" },
        { label: "League of Legends", value: "lol", emoji: "🎮" },
        { label: "Valorant", value: "valorant", emoji: "🔫" },
        { label: "Rocket League", value: "rocketleague", emoji: "🚗" },
        { label: "Call of Duty", value: "cod", emoji: "💀" },
        { label: "Fortnite", value: "fortnite", emoji: "🏗️" },
        { label: "NBA 2K", value: "nba2k", emoji: "🏀" },
        { label: "Madden NFL", value: "madden", emoji: "🏈" },
        { label: "Mario Kart", value: "mariokart", emoji: "🏎️" },
        { label: "Other", value: "other", emoji: "🎲" },
      ),
  );

  await interaction.reply({
    content: `${mode === "freeplay" ? "🎮 **Freeplay** challenge" : "⚔️ **Wager** challenge"} against ${target}.\n\n**Step 1:** Pick a game franchise:`,
    components: [gameSelect as any],
    ephemeral: true,
  });
}

// ── Step 2: Pick specific title (if franchise has sub-games), otherwise go to platform ──

export async function handleGameSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, targetDiscordId] = interaction.customId.split(":");
  const mode = prefix === "fp_game" ? "freeplay" : "real";
  const game = interaction.values[0];
  const profile = getGameProfile(game);

  // If franchise has sub-games, show title select
  if (profile?.subGames && profile.subGames.length > 0) {
    const titlePrefix = mode === "freeplay" ? "fp_title" : "wager_title";

    const titleSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${titlePrefix}:${targetDiscordId}:${game}`)
        .setPlaceholder(`Pick a ${profile.name} title`)
        .addOptions(
          profile.subGames.map(title => ({
            label: title,
            value: title,
          })),
        ),
    );

    await interaction.update({
      content: `**Step 2:** Which **${profile.name}** title?`,
      components: [titleSelect as any],
    });
    return;
  }

  // No sub-games — go straight to platform select
  await showPlatformSelect(interaction, mode, targetDiscordId, game, null);
}

// ── Step 2b: Handle title selection → show platform select ──

export async function handleTitleSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, targetDiscordId, game] = interaction.customId.split(":");
  const mode = prefix === "fp_title" ? "freeplay" : "real";
  const title = interaction.values[0];

  await showPlatformSelect(interaction, mode, targetDiscordId, game, title);
}

// ── Step 3: Pick platform ──

async function showPlatformSelect(
  interaction: StringSelectMenuInteraction,
  mode: string,
  targetDiscordId: string,
  game: string,
  title: string | null,
) {
  const platformPrefix = mode === "freeplay" ? "fp_platform" : "wager_platform";
  // Encode title in customId (use _ as separator, replace spaces)
  const titleEncoded = title ? encodeURIComponent(title) : "none";

  const platformSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${platformPrefix}:${targetDiscordId}:${game}:${titleEncoded}`)
      .setPlaceholder("Pick a platform")
      .addOptions(PLATFORM_OPTIONS),
  );

  const profile = getGameProfile(game);
  const displayName = title ? `${profile?.name ?? game} — ${title}` : (profile?.name ?? game);

  await interaction.update({
    content: `**${displayName}**\n\n**Step 3:** What platform?`,
    components: [platformSelect as any],
  });
}

// ── Step 4: Handle platform selection → show amount modal ──

export async function handlePlatformSelect(interaction: StringSelectMenuInteraction) {
  const parts = interaction.customId.split(":");
  const prefix = parts[0];
  const targetDiscordId = parts[1];
  const game = parts[2];
  const titleEncoded = parts[3];
  const mode = prefix === "fp_platform" ? "freeplay" : "real";
  const platform = interaction.values[0];
  const title = titleEncoded === "none" ? null : decodeURIComponent(titleEncoded);

  // Show amount modal — encode game, title, and platform in the customId
  const modalPrefix = mode === "freeplay" ? "fp_amount" : "wager_amount";
  const titleForId = title ? encodeURIComponent(title) : "none";

  const modal = new ModalBuilder()
    .setCustomId(`${modalPrefix}:${targetDiscordId}:${game}:${titleForId}:${platform}`)
    .setTitle(`${mode === "freeplay" ? "Freeplay" : "Wager"} Amount`);

  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(`How many ${mode === "freeplay" ? "FP" : "MP"} to stake?`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("500")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
  await interaction.showModal(modal);
}

// ── Step 5: Handle amount modal → create wager ──

export async function handleAmountModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":");
  const prefix = parts[0];
  const targetDiscordId = parts[1];
  const game = parts[2];
  const titleEncoded = parts[3] ?? "none";
  const platform = parts[4] ?? null;
  const mode = prefix === "fp_amount" ? "freeplay" : "real";
  const title = titleEncoded === "none" ? null : decodeURIComponent(titleEncoded);

  const amountStr = interaction.fields.getTextInputValue("amount");
  const amount = parseInt(amountStr);

  if (isNaN(amount) || amount < 10) {
    return interaction.reply({ content: "Amount must be at least 10.", ephemeral: true });
  }

  await interaction.deferReply();

  const creator = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const targetUser = await interaction.client.users.fetch(targetDiscordId);
  await userService.ensureUser(targetUser.id, targetUser.username);
  const opponentUser = await userService.findByDiscordId(targetDiscordId);

  const wager = await wagerService.createWager(
    creator.id, opponentUser!.id, game, amount,
    interaction.guildId ?? undefined, interaction.channelId ?? undefined,
    mode,
  );

  // Store title and platform
  const updates: Record<string, any> = {};
  if (title) updates.rulesNotes = title;
  if (platform) updates.platform = platform;
  if (Object.keys(updates).length > 0) {
    await db.update(wagers).set(updates).where(eq(wagers.id, wager.id));
  }

  const profile = getGameProfile(game);
  const gameName = profile?.name ?? game.toUpperCase();
  const displayName = title ? `${gameName} — ${title}` : gameName;
  const platformLabel = platform ? ` · ${platform.toUpperCase()}` : "";

  const creatorRep = await reputationService.getReputation(creator.id);
  const opponentRep = await reputationService.getReputation(opponentUser!.id);
  const creatorBadge = creatorRep ? reputationService.getRepBadge(creatorRep.reputation) : "✅ 100";
  const opponentBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  const modeLabel = mode === "freeplay" ? "🎮 **FREE PLAY** · " : "⚔️ ";
  const currencyLabel = mode === "freeplay" ? "FP" : "MP";

  await interaction.editReply({
    content: `${modeLabel}${interaction.user} (${creatorBadge}) vs ${targetUser} (${opponentBadge}) · **${displayName}**${platformLabel} · **${amount}** ${currencyLabel} each`,
    components: [acceptButton(wager.id)],
  });


  // Create thread
  try {
    const channel = interaction.channel;
    if (channel && channel.type === ChannelType.GuildText) {
      const threadEmoji = mode === "freeplay" ? "🎮" : "⚔️";
      const thread = await (channel as TextChannel).threads.create({
        name: `${threadEmoji} ${interaction.user.username} vs ${targetUser.username} · ${displayName}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
        type: ChannelType.PrivateThread,
        reason: `Wager ${wager.id}`,
      });

      await thread.members.add(interaction.user.id);
      await thread.members.add(targetDiscordId);
      await db.update(wagers).set({ channelId: thread.id }).where(eq(wagers.id, wager.id));

      const rulesBlock = profile
        ? profile.rules.map(r => `• ${r}`).join("\n")
        : "• Custom rules — agree before playing.";

      const feeInfo = mode === "freeplay"
        ? `Winner gets: **${amount * 2}** FP · No fees`
        : `Pot: **${amount * 2}** · Fee: **${wager.fee}** · Winner gets: **${amount * 2 - wager.fee}**`;

      await thread.send([
        `${modeLabel}**Wager Details**`,
        `${interaction.user} (${creatorBadge}) vs ${targetUser} (${opponentBadge}) · **${displayName}**${platformLabel}`,
        `Stake: **${amount}** ${currencyLabel} each · ${feeInfo}`,
        ``,
        `**Rules:**`,
        rulesBlock,
        ``,
        `${targetUser}, hit **Accept Wager** above to accept.`,
      ].join("\n"));
    }
  } catch (err) {
    console.error("[ContextMenu] Thread creation failed:", err);
  }
}

async function handleViewRepContext(interaction: UserContextMenuCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.targetUser;
  const user = await userService.findByDiscordId(target.id);

  if (!user) {
    return interaction.editReply({ content: `${target.username} hasn't registered yet.` });
  }

  const rep = await reputationService.getReputation(user.id);
  if (!rep) return interaction.editReply({ content: "Not found." });

  const emoji = rep.banned ? "🚫" : rep.tier === "Trusted" ? "⭐" : rep.tier === "Good" ? "✅" : "⚠️";

  const allWagers = await db.select().from(wagers).where(
    eq(wagers.status, "settled"),
  );
  const userWagers = allWagers.filter(w => w.creatorId === user.id || w.opponentId === user.id);
  const wins = userWagers.filter(w => w.winnerId === user.id).length;
  const losses = userWagers.length - wins;

  await interaction.editReply({
    content: [
      `${emoji} **${target.username}**`,
      `Rep: **${rep.reputation}**/200 · ${rep.tier}`,
      `Record: **${wins}**W / **${losses}**L${userWagers.length > 0 ? ` (${Math.round((wins / userWagers.length) * 100)}%)` : ""}`,
      `Strikes: ${rep.strikes}/3${rep.banned ? " · **BANNED**" : ""}`,
    ].join("\n"),
  });
}
