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

async function handleChallengeContext(interaction: UserContextMenuCommandInteraction, mode: "real" | "freeplay") {
  const target = interaction.targetUser;

  if (target.bot) {
    return interaction.reply({ content: "Can't wager against a bot.", ephemeral: true });
  }
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "Can't wager against yourself.", ephemeral: true });
  }

  // Show a game select menu
  const prefix = mode === "freeplay" ? "fp_game" : "wager_game";

  const gameSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${prefix}:${target.id}`)
      .setPlaceholder("Pick a game")
      .addOptions(
        { label: "FIFA / EA FC", value: "fifa", emoji: "⚽" },
        { label: "League of Legends", value: "lol", emoji: "🎮" },
        { label: "Valorant", value: "valorant", emoji: "🔫" },
        { label: "Rocket League", value: "rocketleague", emoji: "🚗" },
        { label: "Call of Duty", value: "cod", emoji: "💀" },
        { label: "Fortnite", value: "fortnite", emoji: "🏗️" },
        { label: "Other", value: "other", emoji: "🎲" },
      ),
  );

  await interaction.reply({
    content: `${mode === "freeplay" ? "🎮 **Freeplay** challenge" : "⚔️ **Wager** challenge"} against ${target}. Pick a game:`,
    components: [gameSelect as any],
    ephemeral: true,
  });
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

  // Get win/loss record
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

// ── Game Select → Amount Modal Flow ──

export async function handleGameSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, targetDiscordId] = interaction.customId.split(":");
  const mode = prefix === "fp_game" ? "freeplay" : "real";
  const game = interaction.values[0];

  // Show amount modal
  const modal = new ModalBuilder()
    .setCustomId(`${mode === "freeplay" ? "fp_amount" : "wager_amount"}:${targetDiscordId}:${game}`)
    .setTitle(`${mode === "freeplay" ? "Freeplay" : "Wager"} Amount`);

  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(`How many ${mode === "freeplay" ? "coins" : "tokens"} to stake?`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("500")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
  await interaction.showModal(modal);
}

export async function handleAmountModal(interaction: ModalSubmitInteraction) {
  const [prefix, targetDiscordId, game] = interaction.customId.split(":");
  const mode = prefix === "fp_amount" ? "freeplay" : "real";
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

  const profile = getGameProfile(game);
  const gameName = profile?.name ?? game.toUpperCase();

  const creatorRep = await reputationService.getReputation(creator.id);
  const opponentRep = await reputationService.getReputation(opponentUser!.id);
  const creatorBadge = creatorRep ? reputationService.getRepBadge(creatorRep.reputation) : "✅ 100";
  const opponentBadge = opponentRep ? reputationService.getRepBadge(opponentRep.reputation) : "✅ 100";

  const modeLabel = mode === "freeplay" ? "🎮 **FREE PLAY** · " : "⚔️ ";
  const currencyLabel = mode === "freeplay" ? "coins" : "tokens";

  await interaction.editReply({
    content: `${modeLabel}${interaction.user} (${creatorBadge}) vs ${targetUser} (${opponentBadge}) · **${gameName}** · **${amount}** ${currencyLabel} each`,
    components: [acceptButton(wager.id)],
  });

  // Create thread
  try {
    const channel = interaction.channel;
    if (channel && channel.type === ChannelType.GuildText) {
      const threadEmoji = mode === "freeplay" ? "🎮" : "⚔️";
      const thread = await (channel as TextChannel).threads.create({
        name: `${threadEmoji} ${interaction.user.username} vs ${targetUser.username} · ${gameName}`,
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
        ? `Winner gets: **${amount * 2}** coins · No fees`
        : `Pot: **${amount * 2}** · Fee: **${wager.fee}** · Winner gets: **${amount * 2 - wager.fee}**`;

      await thread.send([
        `${modeLabel}**Wager Details**`,
        `${interaction.user} (${creatorBadge}) vs ${targetUser} (${opponentBadge}) · **${gameName}**`,
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
