/**
 * Sets up channel gating:
 * - Creates @Member role
 * - Locks all channels behind @Member except #welcome and #rules
 * - Adds "I Accept" button to #rules
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client, GatewayIntentBits, ChannelType, PermissionFlagsBits,
  OverwriteType, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

// Channels that should be visible WITHOUT @Member
const PUBLIC_CHANNELS = ["welcome", "rules"];

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  // ── Create @Member role if it doesn't exist ──
  let memberRole = guild.roles.cache.find(r => r.name === "Member");
  if (!memberRole) {
    memberRole = await guild.roles.create({
      name: "Member",
      color: 0x2f3136, // dark, blends in
      hoist: false,
      reason: "Rule acceptance gating",
    });
    console.log("✓ Created @Member role");
  } else {
    console.log("⏭ @Member role exists");
  }

  // ── Lock channels ──
  console.log("\n── Setting channel permissions ──");
  const channels = await guild.channels.fetch();

  for (const [, ch] of channels) {
    if (!ch || ch.type === ChannelType.GuildCategory) continue;
    if (ch.type !== ChannelType.GuildText) continue;

    const isPublic = PUBLIC_CHANNELS.includes(ch.name);

    if (isPublic) {
      // Everyone can see, nobody can send (except bot)
      await ch.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages],
        },
        {
          id: client.user!.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
        },
      ]);
      console.log(`  🔓 #${ch.name} — visible to everyone (read-only)`);
    } else {
      // Only @Member can see
      await ch.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: memberRole.id,
          type: OverwriteType.Role,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: client.user!.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
        },
      ]);
      console.log(`  🔒 #${ch.name} — @Member only`);
    }
  }

  // ── Add "I Accept" button to #rules ──
  console.log("\n── Adding accept button to #rules ──");
  const rulesChannel = channels.find(c => c?.type === ChannelType.GuildText && c.name === "rules") as TextChannel | undefined;

  if (rulesChannel) {
    const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_rules")
        .setLabel("I have read and accept the rules")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
    );

    await rulesChannel.send({
      content: `**Click below to accept the rules and unlock the server:**`,
      components: [acceptRow],
    });
    console.log("✓ Accept button added to #rules");
  }

  console.log("\n✅ Channel gating set up!");
  console.log("New members see only #welcome and #rules.");
  console.log("Clicking 'I Accept' gives them @Member and unlocks everything else.");

  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
