import { Client, GatewayIntentBits, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { config } from "dotenv";
import { commands } from "./commands.js";
import { handleCommand } from "./handler.js";
import { handleButton } from "./buttons.js";
import { handleContextMenu, handleGameSelect, handleTitleSelect, handlePlatformSelect, handleAmountModal } from "./context-menu.js";
import { handleOnboardingButton, buildOnboardingMessage, handleSetupButton } from "./onboarding.js";
import { handleVerifyStart, handleVerifySubmit, handleVerifyCheck, handleGamePick, handleVerifyConnect, handleGameSelectButton } from "./verify-gate.js";
import { setBotClient, sendWelcomeDM } from "./notifications.js";

config();

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

async function registerCommands() {
  const rest = new REST().setToken(token);
  const guildId = process.env.GUILD_ID;
  console.log("Registering commands...");

  if (guildId) {
    // Guild commands update instantly (no 1-hour cache)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log("Commands registered (guild-specific, instant).");
  } else {
    // Fallback to global (up to 1 hour cache)
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log("Commands registered (global).");
  }
}

async function main() {
  await registerCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
  });

  // Channels where non-bot messages get auto-deleted
  const AUTO_DELETE_CHANNELS = new Set([
    "find-match", "free-play", "results", "leaderboard",
    "disputes", "link-accounts", "welcome", "rules",
    "wager-limits", "setup-guide", "dispute-policy",
  ]);

  client.on("ready", () => {
    console.log(`Bot online as ${client.user?.tag}`);
    setBotClient(client);
  });

  // Auto-delete non-bot messages in locked channels
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    const channelName = "name" in message.channel ? (message.channel as any).name : "";
    if (AUTO_DELETE_CHANNELS.has(channelName)) {
      try { await message.delete(); } catch {}
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
      }
      // Right-click context menu
      else if (interaction.isUserContextMenuCommand()) {
        await handleContextMenu(interaction);
      }
      // Buttons
      else if (interaction.isButton()) {
        const id = interaction.customId;
        if (id.startsWith("onboard_")) {
          await handleOnboardingButton(interaction);
        } else if (id.startsWith("setup_")) {
          await handleSetupButton(interaction);
        } else if (id.startsWith("vstart:")) {
          await handleVerifyStart(interaction, id.split(":")[1]);
        } else if (id.startsWith("vcheck:")) {
          await handleVerifyCheck(interaction, id.split(":")[1]);
        } else if (id === "vconnect") {
          await handleVerifyConnect(interaction);
        } else if (id.startsWith("gsel:")) {
          await handleGameSelectButton(interaction, id.split(":")[1]);
        } else if (id === "accept_rules") {
          await handleAcceptRules(interaction);
        } else if (id === "accept_wager_limits") {
          await handleAcceptWagerLimits(interaction);
        } else {
          await handleButton(interaction);
        }
      }
      // Select menus (game picker from context menu)
      else if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        if (id === "vgame_pick") {
          await handleGamePick(interaction);
        } else if (id.startsWith("wager_game:") || id.startsWith("fp_game:")) {
          await handleGameSelect(interaction);
        } else if (id.startsWith("wager_title:") || id.startsWith("fp_title:")) {
          await handleTitleSelect(interaction);
        } else if (id.startsWith("wager_platform:") || id.startsWith("fp_platform:")) {
          await handlePlatformSelect(interaction);
        }
      }
      // Modals
      else if (interaction.isModalSubmit()) {
        const id = interaction.customId;
        if (id === "accept_rules_modal") {
          await handleAcceptRulesModal(interaction);
        } else if (id.startsWith("vsubmit:")) {
          await handleVerifySubmit(interaction, id.split(":")[1]);
        } else if (id.startsWith("wager_amount:") || id.startsWith("fp_amount:")) {
          await handleAmountModal(interaction);
        } else if (id.startsWith("withdrawal_modal:")) {
          await handleWithdrawalModal(interaction);
        }
      }
    } catch (err: any) {
      console.error("[Bot] Interaction error:", err.message);
    }
  });

  // Welcome DM with simple message when someone joins
  client.on("guildMemberAdd", async (member) => {
    if (member.user.bot) return;
    try {
      const dm = await member.user.createDM();
      await dm.send(`Welcome to **MATCHPOINT** ⚔️\n\nPlease head over to **#verify** to begin using the server.`);
    } catch (err) {
      console.error("[Onboarding] Failed to DM:", err);
    }
  });

  client.on("error", (err) => {
    console.error("[Bot] Client error:", err.message);
  });

  await client.login(token);
}

async function handleAcceptRules(interaction: any) {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    await guild.roles.fetch();
    const memberRole = guild.roles.cache.find((r: any) => r.name === "Member");
    const member = await guild.members.fetch(interaction.user.id);

    if (memberRole && member.roles.cache.has(memberRole.id)) {
      await interaction.reply({ content: "You've already accepted the rules!", ephemeral: true });
      return;
    }

    // Show modal asking for display name
    const modal = new ModalBuilder()
      .setCustomId("accept_rules_modal")
      .setTitle("Accept Rules & Set Display Name");

    const nameInput = new TextInputBuilder()
      .setCustomId("display_name")
      .setLabel("Choose your display name")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(interaction.user.username)
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(28);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
    await interaction.showModal(modal);
  } catch (err: any) {
    console.error("[AcceptRules] Error:", err.message);
  }
}

async function handleAcceptRulesModal(interaction: any) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    if (!guild) return interaction.editReply({ content: "Server not found." });

    const displayName = interaction.fields.getTextInputValue("display_name").trim();

    await guild.roles.fetch();
    const memberRole = guild.roles.cache.find((r: any) => r.name === "Member");
    if (!memberRole) return interaction.editReply({ content: "Role not configured. Contact an admin." });

    const member = await guild.members.fetch(interaction.user.id);

    // Assign @Member role
    await member.roles.add(memberRole);

    // Assign starting tier role (@Good = 100 rep default)
    const goodRole = guild.roles.cache.find((r: any) => r.name === "Good");
    if (goodRole) await member.roles.add(goodRole);

    // Set nickname with tier emoji
    if (member.manageable) {
      await member.setNickname(`✅ ${displayName}`);
    }

    await interaction.editReply({
      content: `✅ Welcome, **${displayName}**! Rules accepted, server unlocked. Check out **#setup-guide** to get started.`,
    });
  } catch (err: any) {
    console.error("[AcceptRulesModal] Error:", err.message);
    try { await interaction.editReply({ content: "Something went wrong. Try again." }); } catch {}
  }
}

main().catch(console.error);

async function handleAcceptWagerLimits(interaction: any) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    if (!guild) return interaction.editReply({ content: "Server not found." });

    await guild.roles.fetch();
    const competitorRole = guild.roles.cache.find((r: any) => r.name === "Competitor");
    if (!competitorRole) return interaction.editReply({ content: "Role not configured. Contact an admin." });

    const member = await guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(competitorRole.id)) {
      return interaction.editReply({ content: "You've already acknowledged the wager limits!" });
    }

    await member.roles.add(competitorRole);
    await interaction.editReply({ content: "✅ Acknowledged! Real competition channels are now unlocked. Head to **#find-match** to challenge someone." });
  } catch (err: any) {
    console.error("[AcceptWagerLimits] Error:", err.message);
    try { await interaction.editReply({ content: "Something went wrong. Try again." }); } catch {}
  }
}

async function handleWithdrawalModal(interaction: any) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const withdrawalId = interaction.customId.split(":")[1];
    const txHash = interaction.fields.getTextInputValue("tx_hash").trim();

    if (!txHash) {
      return interaction.editReply({ content: "Transaction hash is required." });
    }

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.js");
    const { withdrawals, users } = await import("../db/schema.js");

    const [withdrawal] = await db.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
    if (!withdrawal) {
      return interaction.editReply({ content: "Withdrawal not found." });
    }
    if (withdrawal.status === "completed") {
      return interaction.editReply({ content: "Already marked as completed." });
    }

    // Update withdrawal with tx hash and mark as completed
    await db.update(withdrawals)
      .set({ status: "completed", txHash, updatedAt: new Date() })
      .where(eq(withdrawals.id, withdrawalId));

    // Update the original message
    try {
      await interaction.message.edit({
        embeds: [{
          ...interaction.message.embeds[0]?.data,
          title: "✅ Withdrawal Sent",
          color: 0x27ae60,
          fields: [
            ...(interaction.message.embeds[0]?.data?.fields ?? []),
            { name: "Tx Hash", value: `[\`${txHash.slice(0, 16)}...\`](https://solscan.io/tx/${txHash})`, inline: false },
          ],
        }],
        components: [],
      });
    } catch {}

    // DM the user
    try {
      const [user] = await db.select().from(users).where(eq(users.id, withdrawal.userId));
      if (user) {
        const { getBotClient } = await import("./notifications.js");
        const client = getBotClient();
        if (client) {
          const discordUser = await client.users.fetch(user.discordId);
          await discordUser.send({
            embeds: [{
              title: "✅ Withdrawal Complete",
              description: `Your withdrawal of **${withdrawal.tokenAmount} MP** ($${withdrawal.usdValue}) has been sent to your wallet.`,
              color: 0x27ae60,
              fields: [
                { name: "Address", value: `\`${withdrawal.destinationAddress}\``, inline: false },
                { name: "Transaction", value: `[View on Solscan](https://solscan.io/tx/${txHash})`, inline: false },
              ],
              footer: { text: "MATCHPOINT" },
              timestamp: new Date().toISOString(),
            }],
          });
        }
      }
    } catch {}

    await interaction.editReply({
      content: `✅ Withdrawal \`${withdrawalId}\` marked as sent.\nTx: https://solscan.io/tx/${txHash}\nUser has been notified.`,
    });
  } catch (err: any) {
    console.error("[WithdrawalModal] Error:", err.message);
    try { await interaction.editReply({ content: `Error: ${err.message}` }); } catch {}
  }
}
