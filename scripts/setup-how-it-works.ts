/**
 * Creates/renames #how-it-works channel and posts the interactive onboarding guide.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client, GatewayIntentBits, ChannelType, TextChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  // Find or rename get-started → how-it-works
  let channel = channels.find(c => c?.type === ChannelType.GuildText && c.name === "how-it-works") as TextChannel | undefined;

  if (!channel) {
    const getStarted = channels.find(c => c?.type === ChannelType.GuildText && c.name === "get-started") as TextChannel | undefined;
    if (getStarted) {
      await getStarted.setName("how-it-works");
      await getStarted.setTopic("How MATCHPOINT works + setup guide");
      channel = getStarted;
      console.log("Renamed #get-started → #how-it-works");
    } else {
      // Create it in the INFO category
      const infoCategory = channels.find(c => c?.type === ChannelType.GuildCategory && c.name.includes("INFO"));
      channel = await guild.channels.create({
        name: "how-it-works",
        type: ChannelType.GuildText,
        parent: infoCategory?.id,
        topic: "How MATCHPOINT works + setup guide",
      }) as TextChannel;
      console.log("Created #how-it-works");
    }
  }

  // Clear existing messages
  const msgs = await channel.messages.fetch({ limit: 50 });
  for (const [, msg] of msgs) {
    try { await msg.delete(); } catch {}
  }

  // ── Post 1: Overview ──
  await channel.send([
    `# How MATCHPOINT Works`,
    ``,
    `**🎮 Free Play** — ready to go, no setup needed:`,
    `→ \`/daily\` to claim 1,000 FP`,
    `→ \`/freeplay @opponent game amount\` or right-click → Freeplay Challenge`,
    `→ No account linking required. Jump in and start playing.`,
    ``,
    `**💰 Real Wagers** — requires setup (see below):`,
    `→ Link your game accounts for verification`,
    `→ Install Medal.tv for automatic clip capture`,
    `→ Deposit MP via the website`,
    `→ Right-click → Challenge to Wager`,
  ].join("\n"));

  // ── Post 2: How a match works ──
  await channel.send([
    `## Match Flow`,
    ``,
    `\`1.\` **Challenge** — right-click a player → Apps → Challenge to Wager`,
    `\`2.\` **Accept** — opponent clicks Accept, both players' MP locked`,
    `\`3.\` **Ready** — both click "I'm Ready" when in the game lobby`,
    `\`4.\` **Play** — match goes live, Medal records in the background`,
    `\`5.\` **Clip** — match ends, press F8 to save clip, click "Match Over"`,
    `\`6.\` **Report** — both click "I Won" or "I Lost" (blind, neither sees the other's answer)`,
    `\`7.\` **Settle** — results match → winner paid instantly. Disagree → dispute with clip evidence.`,
    ``,
    `Fake results = **instant permanent ban**. Your linked accounts get blacklisted too.`,
  ].join("\n"));

  // ── Post 3: Setup checklist header ──
  await channel.send([
    `## Setup for Real Wagers`,
    `Complete each step below. Click the buttons to start each one.`,
    ``,
    `You only need to do this once.`,
  ].join("\n"));

  // ── Step 1: Link Steam/Xbox ──
  const step1Row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup_link_steam").setLabel("Link Steam").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_xbox").setLabel("Link Xbox").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_riot").setLabel("Link Riot").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_ea").setLabel("Link EA").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
  );

  await channel.send({
    content: [
      `### Step 1 — Link a Game Account`,
      `Required for real wagers. Steam & Xbox are verified (you prove you own it). Others are saved on trust.`,
      `Click a button below, then follow the instructions the bot sends you.`,
    ].join("\n"),
    components: [step1Row],
  });

  // ── Step 2: Install Medal ──
  const step2Row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Download Medal.tv (Free)").setStyle(ButtonStyle.Link).setURL("https://medal.tv/download").setEmoji("📥"),
    new ButtonBuilder().setCustomId("setup_link_medal").setLabel("Link Medal Account").setStyle(ButtonStyle.Primary).setEmoji("🎬"),
  );

  await channel.send({
    content: [
      `### Step 2 — Install Medal.tv`,
      `Medal runs in the background and auto-records your gameplay. After each match, press **F8** to save a clip.`,
      `\`1.\` Download and install Medal (free, 30 seconds)`,
      `\`2.\` Create a Medal account if you don't have one`,
      `\`3.\` Click "Link Medal Account" below and enter your Medal user ID`,
      ``,
      `*To find your Medal user ID: go to your Medal profile on the web, your ID is the number in the URL.*`,
    ].join("\n"),
    components: [step2Row],
  });

  // ── Step 3: Deposit ──
  const step3Row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Open Wallet (Website)").setStyle(ButtonStyle.Link).setURL("http://localhost:3000/wallet").setEmoji("💰"),
  );

  await channel.send({
    content: [
      `### Step 3 — Deposit MP`,
      `Go to the MATCHPOINT website, sign in with Discord, and deposit MP.`,
      `100 MP = $1.00 USD. Minimum deposit: 500 MP.`,
    ].join("\n"),
    components: [step3Row],
  });

  // ── Step 4: Ready ──
  await channel.send([
    `### Step 4 — You're Ready!`,
    `Once you've linked an account, installed Medal, and deposited MP:`,
    `→ Head to **#find-match** and right-click someone to challenge them`,
    `→ Or use \`/wager @opponent game amount\``,
    ``,
    `Check your setup status anytime with \`/reputation\` — it shows your rep tier and max wager limit.`,
    ``,
    `Questions? Ask in **#general**.`,
  ].join("\n"));

  console.log("✅ #how-it-works posted!");
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
