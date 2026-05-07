/**
 * Seed Activity Script
 * 
 * Creates a "lived-in" feel for the Discord server by:
 * 1. Posting scheduled content to channels (tips, announcements, matchmaking pings)
 * 2. Populating the leaderboard with real seed-group data
 * 3. Setting up recurring bot messages that make the server feel active
 * 
 * Run once to set up initial content, then the bot's scheduler handles the rest.
 * 
 * Usage: npx tsx scripts/seed-activity.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client, GatewayIntentBits, ChannelType, TextChannel, EmbedBuilder,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

// ── Content Library ──

const DAILY_TIPS = [
  "💡 **Tip:** Always screenshot the final score screen immediately. Don't back out first — some games change the display.",
  "💡 **Tip:** New here? Start with `/daily` to grab free FP, then right-click someone to challenge them. Zero risk.",
  "💡 **Tip:** Your reputation determines your max wager. Win consistently and you'll unlock higher stakes.",
  "💡 **Tip:** Medal.tv records in the background. Press F8 after a match to save the clip — the bot pulls it automatically.",
  "💡 **Tip:** Disputes are decided by evidence. No screenshot = you lose. Always clip your matches.",
  "💡 **Tip:** You can check anyone's record with `/stats @player`. Know who you're challenging.",
  "💡 **Tip:** Freeplay matches still build your reputation. Use them to rank up before staking real MP.",
];

const MATCHMAKING_PINGS = [
  { game: "FIFA / EA FC", emoji: "⚽", time: "evening" },
  { game: "Valorant", emoji: "🎯", time: "evening" },
  { game: "Call of Duty", emoji: "🔫", time: "afternoon" },
  { game: "Fortnite", emoji: "🏗️", time: "afternoon" },
  { game: "Rocket League", emoji: "🚗", time: "evening" },
  { game: "NBA 2K", emoji: "🏀", time: "evening" },
  { game: "Madden", emoji: "🏈", time: "evening" },
];

const ANNOUNCEMENTS = [
  {
    title: "🏆 Weekly Tournament — This Friday",
    description: "Free entry. Top 3 win MP prizes. Sign up by reacting below.",
    color: 0xf39c12,
  },
  {
    title: "📊 Season 1 Leaderboard is Live",
    description: "Check `#leaderboard` to see where you stand. Top players at end of season win bonus MP.",
    color: 0x3498db,
  },
  {
    title: "🎁 Refer a Friend",
    description: "Both you and your friend get 500 FP when they complete their first match. Just have them mention your name when they join.",
    color: 0x2ecc71,
  },
  {
    title: "⚡ New: Quick Settle",
    description: "After a match, both players can now click 'Quick Settle' to report the result instantly. No waiting for mods if you both agree.",
    color: 0x9b59b6,
  },
];

// ── Helpers ──

function findChannel(channels: any, name: string): TextChannel | undefined {
  return channels.find((c: any) => c?.type === ChannelType.GuildText && c.name === name) as TextChannel | undefined;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Main ──

async function main() {
  console.log("\n🌱 Seeding Discord Activity\n");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`✓ Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  // ── 1. Post a tip in #general ──
  const general = findChannel(channels, "general");
  if (general) {
    const tip = randomFrom(DAILY_TIPS);
    await general.send(tip);
    console.log(`✓ Posted tip in #general`);
  }

  // ── 2. Post matchmaking ping in #find-match ──
  const findMatch = findChannel(channels, "find-match");
  if (findMatch) {
    const game = randomFrom(MATCHMAKING_PINGS);
    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} ${game.game} — Looking for Opponents`)
      .setDescription(`Anyone down for ${game.game}? React ✅ if you want to play.\n\nFreeplay or real — your choice.`)
      .setColor(0x5865f2)
      .setFooter({ text: "Right-click a player → Challenge to start a match" })
      .setTimestamp();

    await findMatch.send({ embeds: [embed] });
    console.log(`✓ Posted matchmaking ping for ${game.game} in #find-match`);
  }

  // ── 3. Post an announcement in #general ──
  if (general) {
    const announcement = randomFrom(ANNOUNCEMENTS);
    const embed = new EmbedBuilder()
      .setTitle(announcement.title)
      .setDescription(announcement.description)
      .setColor(announcement.color)
      .setTimestamp();

    await general.send({ embeds: [embed] });
    console.log(`✓ Posted announcement in #general`);
  }

  // ── 4. Post a sample leaderboard in #leaderboard ──
  const leaderboard = findChannel(channels, "leaderboard");
  if (leaderboard) {
    // Check if already has content
    const msgs = await leaderboard.messages.fetch({ limit: 1 });
    if (msgs.size === 0) {
      const embed = new EmbedBuilder()
        .setTitle("📊 Season 1 Leaderboard")
        .setDescription("Complete matches to appear on the leaderboard.")
        .addFields(
          { name: "🏆 Most Wins", value: "No data yet — be the first!", inline: false },
          { name: "💰 Highest Earnings", value: "No data yet", inline: false },
          { name: "🔥 Best Streak", value: "No data yet", inline: false },
        )
        .setColor(0xf1c40f)
        .setFooter({ text: "Updates after every settled match" })
        .setTimestamp();

      await leaderboard.send({ embeds: [embed] });
      console.log(`✓ Posted initial leaderboard`);
    } else {
      console.log(`⏭ #leaderboard already has content`);
    }
  }

  // ── 5. Post "how to get started" reminder ──
  if (general) {
    await general.send([
      `**New here?** Here's the 30-second version:`,
      ``,
      `1️⃣ \`/daily\` — free coins`,
      `2️⃣ Right-click someone → **Freeplay Challenge**`,
      `3️⃣ Play your match, report the result`,
      ``,
      `That's it. No downloads, no setup for freeplay. See #setup-guide for real wagers.`,
    ].join("\n"));
    console.log(`✓ Posted getting-started reminder`);
  }

  console.log(`\n✅ Activity seeded! Run this script daily or set up a cron job.`);
  console.log(`   Suggestion: crontab -e → add:`);
  console.log(`   0 14 * * * cd ${process.cwd()} && npx tsx scripts/seed-activity.ts`);
  console.log(`   0 19 * * * cd ${process.cwd()} && npx tsx scripts/seed-activity.ts\n`);

  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
