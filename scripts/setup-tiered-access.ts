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

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();

  // ── Ensure roles exist ──
  let memberRole = guild.roles.cache.find(r => r.name === "Member");
  if (!memberRole) {
    memberRole = await guild.roles.create({ name: "Member", color: 0x2f3136, hoist: false });
    console.log("✓ Created @Member");
  }

  let competitorRole = guild.roles.cache.find(r => r.name === "Competitor");
  if (!competitorRole) {
    competitorRole = await guild.roles.create({ name: "Competitor", color: 0xD35400, hoist: false });
    console.log("✓ Created @Competitor");
  }

  // ── Channel permission tiers ──
  // Public (no role needed): #welcome, #rules
  // Tier 1 (@Member): #setup-guide, #wager-limits, #link-accounts, #free-play, #general
  // Tier 2 (@Competitor): #find-match, #results, #disputes, #leaderboard

  const publicChannels = ["welcome", "rules"];
  const tier1Channels = ["setup-guide", "wager-limits", "link-accounts", "free-play", "general"];
  const tier2Channels = ["find-match", "results", "disputes", "leaderboard"];

  const channels = await guild.channels.fetch();
  console.log("\n── Setting permissions ──");

  for (const [, ch] of channels) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;

    if (publicChannels.includes(ch.name)) {
      await ch.permissionOverwrites.set([
        { id: guild.roles.everyone.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user!.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ]);
      console.log(`  🔓 #${ch.name} — everyone (read-only)`);

    } else if (tier1Channels.includes(ch.name)) {
      const canSend = ["free-play", "general"].includes(ch.name);
      await ch.permissionOverwrites.set([
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: memberRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, ...(canSend ? [PermissionFlagsBits.SendMessages] : [])], deny: canSend ? [] : [PermissionFlagsBits.SendMessages] },
        { id: client.user!.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ]);
      console.log(`  🔒 #${ch.name} — @Member${canSend ? "" : " (read-only)"}`);

    } else if (tier2Channels.includes(ch.name)) {
      const canSend = ["find-match"].includes(ch.name);
      await ch.permissionOverwrites.set([
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: competitorRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, ...(canSend ? [PermissionFlagsBits.SendMessages] : [])], deny: canSend ? [] : [PermissionFlagsBits.SendMessages] },
        { id: client.user!.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ]);
      console.log(`  🔒 #${ch.name} — @Competitor${canSend ? "" : " (read-only)"}`);
    }
  }

  // ── Add accept button to #wager-limits ──
  const wagerLimits = channels.find(c => c?.type === ChannelType.GuildText && c.name === "wager-limits") as TextChannel | undefined;
  if (wagerLimits) {
    const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_wager_limits")
        .setLabel("I understand the wager limits and risks")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
    );
    await wagerLimits.send({
      content: `**Click below to acknowledge the wager limits and unlock real competitions:**`,
      components: [acceptRow],
    });
    console.log("\n✓ Accept button added to #wager-limits");
  }

  console.log("\n✅ Tiered access set up!");
  console.log("Accept rules → @Member → setup-guide, wager-limits, free-play, general");
  console.log("Accept wager-limits → @Competitor → find-match, results, disputes, leaderboard");

  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
