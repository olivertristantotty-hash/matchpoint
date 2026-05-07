import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, TextChannel } from "discord.js";
import { config } from "dotenv";

config();

const token = process.env.DISCORD_TOKEN!;

// Channels where normal messages are BLOCKED (slash commands + buttons only)
const LOCKED_CHANNELS = [
  "find-match",
  "free-play",
  "results",
  "leaderboard",
  "disputes",
  "link-accounts",
];

// Channels that are READ-ONLY (no messages, no slash commands — just view + buttons)
const READ_ONLY_CHANNELS = [
  "welcome",
  "rules",
  "wager-limits",
  "setup-guide",
];

// Channels where normal chat is ALLOWED
const OPEN_CHANNELS = [
  "general",
  "moderator-only",
];

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(token);
  await new Promise<void>((resolve) => client.once("ready", () => resolve()));
  console.log(`Logged in as ${client.user?.tag}`);

  for (const [, guild] of client.guilds.cache) {
    console.log(`Processing guild: ${guild.name}`);

    const channels = await guild.channels.fetch();
    const everyoneRole = guild.roles.everyone;

    for (const [, channel] of channels) {
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      const textChannel = channel as TextChannel;

      if (LOCKED_CHANNELS.includes(textChannel.name)) {
        // Block SendMessages but keep UseApplicationCommands and other interactions
        await textChannel.permissionOverwrites.edit(everyoneRole, {
          [PermissionFlagsBits.SendMessages.toString()]: false,
          [PermissionFlagsBits.UseApplicationCommands.toString()]: true,
          [PermissionFlagsBits.ViewChannel.toString()]: true,
          [PermissionFlagsBits.ReadMessageHistory.toString()]: true,
        });
        console.log(`  🔒 #${textChannel.name} — locked (slash commands only)`);
      } else if (READ_ONLY_CHANNELS.includes(textChannel.name)) {
        // Read only — no messages, no slash commands, just view + buttons
        await textChannel.permissionOverwrites.edit(everyoneRole, {
          [PermissionFlagsBits.SendMessages.toString()]: false,
          [PermissionFlagsBits.UseApplicationCommands.toString()]: false,
          [PermissionFlagsBits.ViewChannel.toString()]: true,
          [PermissionFlagsBits.ReadMessageHistory.toString()]: true,
        });
        console.log(`  👁️ #${textChannel.name} — read only`);
      } else if (OPEN_CHANNELS.includes(textChannel.name)) {
        // Ensure normal chat is allowed
        await textChannel.permissionOverwrites.edit(everyoneRole, {
          [PermissionFlagsBits.SendMessages.toString()]: true,
          [PermissionFlagsBits.UseApplicationCommands.toString()]: true,
          [PermissionFlagsBits.ViewChannel.toString()]: true,
        });
        console.log(`  💬 #${textChannel.name} — open (normal chat)`);
      }
    }
  }

  console.log("Done!");
  client.destroy();
  process.exit(0);
}

main().catch(console.error);
