import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { config } from "dotenv";
import { commands } from "./commands.js";
import { handleCommand } from "./handler.js";
import { handleButton } from "./buttons.js";
import { handleContextMenu, handleGameSelect, handleAmountModal } from "./context-menu.js";
import { handleOnboardingButton, buildOnboardingMessage } from "./onboarding.js";
import { setBotClient, sendWelcomeDM } from "./notifications.js";

config();

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

async function registerCommands() {
  const rest = new REST().setToken(token);
  console.log("Registering commands...");
  await rest.put(Routes.applicationCommands(clientId), {
    body: commands.map(c => c.toJSON()),
  });
  console.log("Commands registered.");
}

async function main() {
  await registerCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.on("ready", () => {
    console.log(`Bot online as ${client.user?.tag}`);
    setBotClient(client);
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
        } else {
          await handleButton(interaction);
        }
      }
      // Select menus (game picker from context menu)
      else if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        if (id.startsWith("wager_game:") || id.startsWith("fp_game:")) {
          await handleGameSelect(interaction);
        }
      }
      // Modals (amount input from context menu)
      else if (interaction.isModalSubmit()) {
        const id = interaction.customId;
        if (id.startsWith("wager_amount:") || id.startsWith("fp_amount:")) {
          await handleAmountModal(interaction);
        }
      }
    } catch (err: any) {
      console.error("[Bot] Interaction error:", err.message);
    }
  });

  // Welcome DM with onboarding buttons when someone joins
  client.on("guildMemberAdd", async (member) => {
    if (member.user.bot) return;
    try {
      const user = await member.user.createDM();
      const msg = buildOnboardingMessage();
      await user.send(msg);
    } catch (err) {
      console.error("[Onboarding] Failed to DM:", err);
    }
  });

  client.on("error", (err) => {
    console.error("[Bot] Client error:", err.message);
  });

  await client.login(token);
}

main().catch(console.error);
