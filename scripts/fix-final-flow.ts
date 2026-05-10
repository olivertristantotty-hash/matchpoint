/**
 * Final flow fix:
 * 1. New member joins → sees ONLY #verify
 * 2. After verifying → #verify disappears, #game-selection appears
 * 3. They pick games → game channels unlock
 *
 * Changes:
 * - #game-selection: hidden from @everyone, visible to @Verified, hidden once they have a game role
 *   Actually simpler: visible to @Verified (they see it after verify, pick games, done)
 * - #verify: visible to @everyone, hidden from @Verified
 * - Delete #rules if it still exists (community disabled now)
 * - Lock everything else properly
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const verifiedRole = guild.roles.cache.find((r) => r.name === "Verified")!;
  const owner = await guild.fetchOwner();

  // ── Delete any leftover community channels ──
  console.log("\n── Cleanup ──");
  for (const [, ch] of guild.channels.cache) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const name = (ch as any).name as string;
    if (["rules", "•┃rules❗", "moderator-only"].includes(name)) {
      try {
        await ch.delete("Community disabled, no longer needed");
        console.log(`  ✗ Deleted #${name}`);
      } catch (e: any) {
        console.log(`  ⚠ Can't delete #${name}: ${e.message}`);
      }
    }
  }

  // ── #verify: visible to @everyone (unverified), hidden from @Verified ──
  console.log("\n── #verify ──");
  const verifyChannel = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildText && ((c as any).name.includes("verify")),
  );
  if (verifyChannel) {
    await verifyChannel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        type: OverwriteType.Role,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: verifiedRole.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: client.user!.id,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
      },
    ]);
    console.log(`  ✓ Visible to unverified only`);
  }

  // ── #game-selection: hidden from @everyone, visible to @Verified ──
  console.log("\n── #game-selection ──");
  const gameSelChannel = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildText && (c as any).name.includes("game-selection"),
  );
  if (gameSelChannel) {
    await gameSelChannel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: verifiedRole.id,
        type: OverwriteType.Role,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: client.user!.id,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
      },
    ]);
    console.log(`  ✓ Visible to @Verified only`);
  }

  // ── Lock ALL other channels from @everyone ──
  console.log("\n── Locking everything else ──");
  let locked = 0;
  const skipIds = new Set([verifyChannel?.id, gameSelChannel?.id].filter(Boolean));

  for (const [, ch] of guild.channels.cache) {
    if (!ch) continue;
    if (ch.type === ChannelType.GuildCategory) continue;
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
    if (skipIds.has(ch.id)) continue;

    const name = (ch as any).name as string;

    // Check if @everyone already denied
    const evOverwrite = ch.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (evOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) continue;

    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
      locked++;
    } catch {}
  }
  console.log(`  ✓ Locked ${locked} channels`);

  console.log("\n✅ Done. New members see ONLY #verify.\n");
  await client.destroy();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
