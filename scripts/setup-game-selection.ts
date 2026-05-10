/**
 * Creates the #•┃game-selection channel and posts the game picker embed with buttons.
 * Each button toggles a game role. Uses custom game emojis if uploaded.
 *
 * Channel is visible to unverified users, hidden from @Verified.
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
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

const CHANNEL_NAME = "•┃game-selection";

// Load game emoji IDs if available
const EMOJI_IDS_PATH = resolve(import.meta.dirname ?? ".", "assets/games/emoji-ids.json");
const gameEmojiIds: Record<string, string> = existsSync(EMOJI_IDS_PATH)
  ? JSON.parse(readFileSync(EMOJI_IDS_PATH, "utf8"))
  : {};

const FALLBACK_EMOJI: Record<string, string> = {
  valorant: "🎯", lol: "🗡️", cod: "🔫", fifa: "⚽",
  fortnite: "🏆", rocketleague: "🚗", nba2k: "🏀", madden: "🏈", mariokart: "🏁",
};

const GAMES = [
  { key: "valorant",     label: "Valorant",          customId: "gsel:valorant" },
  { key: "lol",          label: "League of Legends", customId: "gsel:lol" },
  { key: "cod",          label: "Call of Duty",      customId: "gsel:cod" },
  { key: "fifa",         label: "EA FC",             customId: "gsel:fifa" },
  { key: "fortnite",     label: "Fortnite",          customId: "gsel:fortnite" },
  { key: "rocketleague", label: "Rocket League",     customId: "gsel:rocketleague" },
  { key: "nba2k",        label: "NBA 2K",            customId: "gsel:nba2k" },
  { key: "madden",       label: "Madden NFL",        customId: "gsel:madden" },
  { key: "mariokart",    label: "Mario Kart",        customId: "gsel:mariokart" },
];

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const verifiedRole = guild.roles.cache.find((r) => r.name === "Verified");
  if (!verifiedRole) { console.error("No @Verified role"); process.exit(1); }

  // Find the verify channel's parent category (if any) to put game-selection in the same one
  const verifyChannel = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildText && (c as any).name.includes("verify"),
  );
  const parentId = verifyChannel ? (verifyChannel as any).parentId : null;

  // Create or find the game-selection channel
  let gameSelChannel = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildText && (c as any).name === CHANNEL_NAME,
  ) as TextChannel | undefined;

  if (!gameSelChannel) {
    gameSelChannel = await guild.channels.create({
      name: CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: parentId,
      topic: "Pick the games you play to unlock their channels.",
      reason: "Game selection channel",
    }) as TextChannel;
    console.log(`✓ Created #${CHANNEL_NAME}`);
  } else {
    console.log(`⏭ #${CHANNEL_NAME} exists`);
  }

  // Permissions: visible to unverified, hidden from @Verified (same as #verify)
  await gameSelChannel.permissionOverwrites.set([
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

  // Position it above #verify
  try {
    if (verifyChannel) {
      await gameSelChannel.setPosition((verifyChannel as any).position);
    }
  } catch {}

  // Clear old bot messages
  try {
    const msgs = await gameSelChannel.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) {
      if (msg.author.id === client.user!.id) try { await msg.delete(); } catch {}
    }
  } catch {}

  // Build the embed
  const embed = new EmbedBuilder()
    .setTitle("Select Your Games")
    .setDescription(
      [
        "Click the games you play to unlock their wager channels.",
        "You can select multiple. Click again to deselect.",
        "",
        "After selecting, head to the **verify** channel to complete setup.",
      ].join("\n"),
    )
    .setColor(0xD35400)
    .setFooter({ text: "You can change your games anytime by asking a mod." });

  // Build button rows (max 5 per row, we have 9 = 2 rows of 4 + 1 row of 1, or 5+4)
  const makeButton = (g: typeof GAMES[number]) => {
    const btn = new ButtonBuilder()
      .setCustomId(g.customId)
      .setLabel(g.label)
      .setStyle(ButtonStyle.Secondary);

    const emojiId = gameEmojiIds[g.key];
    if (emojiId) {
      btn.setEmoji({ id: emojiId });
    } else {
      btn.setEmoji(FALLBACK_EMOJI[g.key] ?? "🎮");
    }
    return btn;
  };

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...GAMES.slice(0, 5).map(makeButton),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...GAMES.slice(5).map(makeButton),
  );

  await gameSelChannel.send({ embeds: [embed], components: [row1, row2] });
  console.log(`✓ Posted game selection embed with ${GAMES.length} buttons`);

  // Also remove the game picker from #verify (it's now in its own channel)
  if (verifyChannel) {
    try {
      const msgs = await (verifyChannel as TextChannel).messages.fetch({ limit: 10 });
      for (const [, msg] of msgs) {
        if (msg.author.id === client.user!.id && msg.components.length > 1) {
          // This is the old embed with game picker + verify button — replace with just verify button
          const verifyButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("vconnect")
              .setLabel("Verify")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success),
          );
          const newEmbed = new EmbedBuilder()
            .setTitle("Verify Your Account")
            .setDescription(
              [
                "Click **Verify** to link your gaming account.",
                "",
                "We'll check if you have Riot, Steam, Xbox, PlayStation, Epic, or Battle.net connected to your Discord.",
                "",
                "If you don't have one yet: **Discord Settings → Connections** → link any gaming platform.",
              ].join("\n"),
            )
            .setColor(0xD35400)
            .setFooter({ text: "We only check that a gaming account exists." });

          await msg.edit({ embeds: [newEmbed], components: [verifyButtonRow] });
          console.log(`✓ Updated #verify embed (removed game picker)`);
          break;
        }
      }
    } catch {}
  }

  console.log("\n✅ Game selection channel ready.");
  console.log("   Users see: #game-selection → pick games → #verify → verify → server unlocks\n");

  await client.destroy();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
