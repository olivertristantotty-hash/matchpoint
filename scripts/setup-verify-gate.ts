/**
 * Sets up a strict verify gate:
 *
 * - Disables Discord's native onboarding (conflicts with our own gate)
 * - Ensures a @Verified role exists
 * - Creates #verify as the ONLY channel @everyone can see
 * - Locks every other channel in the guild behind @Verified
 * - Posts a verify embed with platform buttons (Steam, Xbox, Riot, PlayStation, Activision)
 *
 * Result: new members join and see a single #verify channel. They click a
 * platform button, link an account, and get @Verified — which unlocks
 * everything else.
 *
 * Idempotent: safe to re-run. Will re-lock any channel that isn't #verify,
 * and will refresh the verify embed (deletes old bot messages in #verify,
 * posts the current one).
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
  CategoryChannel,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

const VERIFY_CHANNEL_NAME = "verify";
const VERIFIED_ROLE_NAME = "Verified";

// Load platform emoji IDs if they've been uploaded via upload-platform-emojis.ts
const EMOJI_IDS_PATH = resolve(import.meta.dirname ?? ".", "assets/platforms/emoji-ids.json");
const platformEmojiIds: Record<string, string> = existsSync(EMOJI_IDS_PATH)
  ? JSON.parse(readFileSync(EMOJI_IDS_PATH, "utf8"))
  : {};

// Fallback emoji if custom logos haven't been uploaded yet
const FALLBACK_EMOJI: Record<string, string> = {
  riot:        "🎯",
  steam:       "🎮",
  xbox:        "🟢",
  playstation: "🔷",
  activision:  "🎖️",
  epic:        "⚡",
};

// Order determines display in the verify embed.
// Max 5 buttons per row; with 6 buttons we render two rows.
const PLATFORM_BUTTONS = [
  { platform: "riot",        label: "Riot",        style: ButtonStyle.Secondary },
  { platform: "steam",       label: "Steam",       style: ButtonStyle.Secondary },
  { platform: "xbox",        label: "Xbox",        style: ButtonStyle.Secondary },
  { platform: "playstation", label: "PlayStation", style: ButtonStyle.Secondary },
  { platform: "activision",  label: "Activision",  style: ButtonStyle.Secondary },
  { platform: "epic",        label: "Epic Games",  style: ButtonStyle.Secondary },
] as const;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  // ── Step 1: Disable Discord native onboarding ──
  // Native onboarding requires 7+ @everyone-readable channels, which conflicts
  // with our single-channel gate. We disable it so we control visibility fully.

  console.log("\n── Native Onboarding ──");

  // Use the raw REST route for full control. discord.js's editOnboarding()
  // sometimes leaves stale default_channel_ids which then block permission
  // edits ("Onboarding channels must be readable by everyone").
  try {
    // @ts-expect-error — client.rest is public in v14 but not typed on this path
    await client.rest.put(`/guilds/${guild.id}/onboarding`, {
      body: {
        prompts: [],
        default_channel_ids: [],
        enabled: false,
        mode: 0,
      },
      reason: "Switching to bot-driven verify gate",
    });
    console.log("  ✓  Disabled native onboarding + cleared default channels");
  } catch (err: any) {
    console.log(`  ⏭  Skipped (${err.message})`);
  }

  // ── Step 2: Ensure @Verified role exists ──

  console.log("\n── @Verified Role ──");
  let verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({
      name: VERIFIED_ROLE_NAME,
      color: 0x2ECC71,
      hoist: false,
      mentionable: false,
      reason: "Verify gate",
    });
    console.log(`  ✓  Created @${VERIFIED_ROLE_NAME}`);
  } else {
    console.log(`  ⏭  @${VERIFIED_ROLE_NAME} exists`);
  }

  // ── Step 3: Ensure #verify channel exists ──

  console.log("\n── #verify Channel ──");
  let verifyChannel = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildText && c.name === VERIFY_CHANNEL_NAME,
  ) as TextChannel | undefined;

  if (!verifyChannel) {
    verifyChannel = await guild.channels.create({
      name: VERIFY_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: "Link a platform account to unlock the server.",
      reason: "Verify gate entry point",
    });
    console.log(`  ✓  Created #${VERIFY_CHANNEL_NAME}`);
  } else {
    console.log(`  ⏭  #${VERIFY_CHANNEL_NAME} exists`);
  }

  // Move #verify to the very top of the channel list (position 0, no category)
  try {
    if (verifyChannel.parentId) {
      await verifyChannel.setParent(null, { lockPermissions: false });
    }
    await verifyChannel.setPosition(0);
  } catch {}

  // #verify: @everyone can VIEW but not SEND; @Verified can't see it either
  // (once verified, no reason to stare at the gate)
  await verifyChannel.permissionOverwrites.set([
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
      ],
    },
    {
      id: verifiedRole.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: client.user!.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ]);

  // ── Step 4: Lock every other channel behind @Verified ──
  // Community servers pin a few channels (rules, server guide entries) open to
  // @everyone at the Discord platform level — we can't hide those. For those
  // channels we fall back to "visible but read-only with no interactive UI".
  //
  // GAMES category channels (valorant-wagers, lol-wagers, etc.) are intentionally
  // skipped here — they stay gated to their per-game roles only, not @Verified.
  // Users pick which games they play after verifying.

  console.log("\n── Locking Other Channels ──");
  let lockedCount = 0;
  let readOnlyCount = 0;
  let skippedGamesCount = 0;
  const stillPublicChannels: string[] = [];

  // Find the GAMES category so we can skip its children
  const gamesCategory = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildCategory && c.name === "GAMES",
  );

  for (const [, ch] of guild.channels.cache) {
    if (!ch) continue;

    // Skip the verify channel itself
    if (ch.id === verifyChannel.id) continue;

    // Skip categories — they inherit from children; we'll re-sync below
    if (ch.type === ChannelType.GuildCategory) continue;

    // Skip GAMES category children — they're gated to per-game roles only
    if (gamesCategory && "parentId" in ch && ch.parentId === gamesCategory.id) {
      skippedGamesCount++;
      continue;
    }

    // Only mess with text-like channels for now
    if (
      ch.type !== ChannelType.GuildText &&
      ch.type !== ChannelType.GuildVoice &&
      ch.type !== ChannelType.GuildAnnouncement &&
      ch.type !== ChannelType.GuildForum
    ) {
      continue;
    }

    // Preserve any existing role/member overwrites (e.g. per-game role gates)
    const existing = Array.from(ch.permissionOverwrites.cache.values());

    // Build the new set: deny @everyone, allow @Verified, keep other overwrites intact,
    // always allow the bot.
    const newOverwrites = [
      {
        id: guild.roles.everyone.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: verifiedRole.id,
        type: OverwriteType.Role,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      // Keep any existing overwrites that aren't @everyone or @Verified
      // (e.g. per-game role visibility, mod overrides)
      ...existing
        .filter((o) => o.id !== guild.roles.everyone.id && o.id !== verifiedRole!.id && o.id !== client.user!.id)
        .map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow.toArray().map((p) => PermissionFlagsBits[p]),
          deny: o.deny.toArray().map((p) => PermissionFlagsBits[p]),
        })),
      {
        id: client.user!.id,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ];

    try {
      await ch.permissionOverwrites.set(newOverwrites as any);
      lockedCount++;
    } catch (err: any) {
      // Community-mode channels that must remain visible to @everyone
      // (rules channel, server guide entries). Fall back to read-only.
      if (err.message?.includes("must be readable by everyone")) {
        try {
          await ch.permissionOverwrites.set([
            {
              id: guild.roles.everyone.id,
              type: OverwriteType.Role,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.CreatePublicThreads,
                PermissionFlagsBits.CreatePrivateThreads,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.UseApplicationCommands,
              ],
            },
            {
              id: verifiedRole.id,
              type: OverwriteType.Role,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            },
            {
              id: client.user!.id,
              type: OverwriteType.Member,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ManageMessages,
              ],
            },
          ]);
          readOnlyCount++;
          stillPublicChannels.push((ch as any).name);
        } catch (innerErr: any) {
          console.log(`  ⚠  Couldn't lock or soften #${(ch as any).name}: ${innerErr.message}`);
        }
      } else {
        console.log(`  ⚠  Couldn't lock #${(ch as any).name}: ${err.message}`);
      }
    }
  }
  console.log(`  ✓  Fully locked ${lockedCount} channels behind @${VERIFIED_ROLE_NAME}`);
  if (skippedGamesCount > 0) {
    console.log(`  ⓘ  Skipped ${skippedGamesCount} GAMES channel(s) — stay gated to per-game roles`);
  }
  if (readOnlyCount > 0) {
    console.log(`  ⓘ  ${readOnlyCount} Community-pinned channel(s) made read-only for @everyone: ${stillPublicChannels.map((n) => `#${n}`).join(", ")}`);
  }

  // Also sync category permissions so new children under them inherit correctly.
  // GAMES category stays hidden at the @Verified level — only per-game roles see it.
  for (const [, cat] of guild.channels.cache) {
    if (cat?.type !== ChannelType.GuildCategory) continue;

    const isGamesCategory = (cat as CategoryChannel).name === "GAMES";

    try {
      const overwrites = [
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ];

      // Only non-GAMES categories are visible to @Verified
      if (!isGamesCategory) {
        overwrites.push({
          id: verifiedRole.id,
          type: OverwriteType.Role,
          deny: [],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        } as any);
      }

      await (cat as CategoryChannel).permissionOverwrites.set(overwrites as any);
    } catch {}
  }

  // ── Step 5: Post the verify embed ──

  console.log("\n── Verify Embed ──");

  // Clear any old bot messages in #verify
  try {
    const existing = await verifyChannel.messages.fetch({ limit: 50 });
    for (const [, msg] of existing) {
      if (msg.author.id === client.user!.id) {
        try { await msg.delete(); } catch {}
      }
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle("Welcome to MATCHPOINT")
    .setDescription(
      [
        "**1. Select the games you play**",
        "**2. Click Verify to link your gaming account**",
        "",
        "We'll check if you have any of these connected to your Discord: Riot Games, League of Legends, Steam, Xbox, PlayStation, Epic Games, or Battle.net.",
        "",
        "If you don't have one connected yet, go to **Discord Settings → Connections** and link any gaming platform first.",
      ].join("\n"),
    )
    .setColor(0xD35400)
    .setFooter({ text: "We only check that a gaming account exists. Nothing is shared." });

  // Game picker (StringSelectMenu)
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = await import("discord.js");

  const gameSelect = new StringSelectMenuBuilder()
    .setCustomId("vgame_pick")
    .setPlaceholder("Select games you play…")
    .setMinValues(1)
    .setMaxValues(9)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Valorant").setValue("valorant").setDescription("Riot 1v1 customs").setEmoji("🎯"),
      new StringSelectMenuOptionBuilder().setLabel("League of Legends").setValue("lol").setDescription("Summoner's Rift 1v1").setEmoji("🗡️"),
      new StringSelectMenuOptionBuilder().setLabel("Call of Duty").setValue("cod").setDescription("BO6, MW3, Warzone").setEmoji("🔫"),
      new StringSelectMenuOptionBuilder().setLabel("EA FC / FIFA").setValue("fifa").setDescription("Online Friendlies").setEmoji("⚽"),
      new StringSelectMenuOptionBuilder().setLabel("Fortnite").setValue("fortnite").setDescription("Box Fight / Zone Wars").setEmoji("🏆"),
      new StringSelectMenuOptionBuilder().setLabel("Rocket League").setValue("rocketleague").setDescription("Private match 1v1").setEmoji("🚗"),
      new StringSelectMenuOptionBuilder().setLabel("NBA 2K").setValue("nba2k").setDescription("Play Now Online").setEmoji("🏀"),
      new StringSelectMenuOptionBuilder().setLabel("Madden NFL").setValue("madden").setDescription("Head to Head").setEmoji("🏈"),
      new StringSelectMenuOptionBuilder().setLabel("Mario Kart").setValue("mariokart").setDescription("VS Race").setEmoji("🏁"),
    );

  const gameRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect);

  // Verify button
  const verifyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vconnect")
      .setLabel("Verify")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
  );

  await verifyChannel.send({ embeds: [embed], components: [gameRow, verifyButton] });
  console.log(`  ✓  Posted verify embed with game picker + verify button`);

  // ── Summary ──

  console.log("\n══════════════════════════════════════");
  console.log("✅ Verify gate live.");
  console.log("");
  console.log("New members see:");
  console.log(`  #${VERIFY_CHANNEL_NAME} only. Nothing else until they verify.`);
  console.log("");
  console.log("After verifying:");
  console.log(`  Gets @${VERIFIED_ROLE_NAME} → sees the rest of the server`);
  console.log("");
  console.log("To test: open the server in a browser with a fresh account");
  console.log("or have a friend join with a new invite link.");
  console.log("══════════════════════════════════════\n");

  await client.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
