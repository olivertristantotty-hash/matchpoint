/**
 * Renames #how-it-works → #setup-guide and posts updated content.
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

  // Find and rename
  let channel = channels.find(c => c?.type === ChannelType.GuildText && c.name === "setup-guide") as TextChannel | undefined;

  if (!channel) {
    const howItWorks = channels.find(c => c?.type === ChannelType.GuildText && c.name === "how-it-works") as TextChannel | undefined;
    if (howItWorks) {
      await howItWorks.setName("setup-guide");
      await howItWorks.setTopic("How to play + account setup");
      channel = howItWorks;
      console.log("Renamed #how-it-works → #setup-guide");
    } else {
      const infoCategory = channels.find(c => c?.type === ChannelType.GuildCategory && c.name.includes("INFO"));
      channel = await guild.channels.create({
        name: "setup-guide",
        type: ChannelType.GuildText,
        parent: infoCategory?.id,
        topic: "How to play + account setup",
      }) as TextChannel;
      console.log("Created #setup-guide");
    }
  }

  // Clear
  const msgs = await channel.messages.fetch({ limit: 50 });
  for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }

  // ── Post 1: Free Play ──
  await channel.send([
    `# MATCHPOINT`,
    ``,
    `**🎮 Free Play — jump in right now, no setup:**`,
    `\`/daily\` → claim 1,000 FP`,
    `Right-click any player → Apps → **Freeplay Challenge**`,
    `No downloads. No linking. No money. Just play.`,
  ].join("\n"));

  // ── Post 2: Match Flow ──
  await channel.send([
    `## How a Match Works`,
    ``,
    `\`1.\` **Challenge** — right-click a player → Challenge to Wager (or \`/wager\`)`,
    `\`2.\` **Accept** — opponent clicks Accept, MP locked`,
    `\`3.\` **Ready** — both click "I'm Ready" in the thread`,
    `\`4.\` **Play** — match goes live, Medal records in background`,
    `\`5.\` **Clip + Match Over** — press F8 to save clip, both click "Match Over"`,
    `\`6.\` **Clips Found** — bot pulls clips from Medal automatically`,
    `\`7.\` **Settle** — click "Quick Settle" if you both agree on the result, or let a mod review the clips`,
    ``,
    `If you quick-settle: both report blind (neither sees the other's answer). Agree = paid. Disagree = dispute with clips as evidence.`,
    ``,
    `**Fake results = instant permanent ban.** Linked accounts get blacklisted.`,
  ].join("\n"));

  // ── Post 3: Setup Header ──
  await channel.send([
    `## Real Wager Setup`,
    `Complete these steps once to unlock real-money wagers.`,
  ].join("\n"));

  // ── Step 1: Link Game Account ──
  const step1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup_link_steam").setLabel("Link Steam").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_xbox").setLabel("Link Xbox").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_riot").setLabel("Link Riot").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_ea").setLabel("Link EA").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
  );

  await channel.send({
    content: [
      `### 1 — Link a Game Account`,
      `Steam & Xbox are verified. Others saved on trust.`,
    ].join("\n"),
    components: [step1],
  });

  // ── Step 2: Medal ──
  const step2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Download Medal (Free)").setStyle(ButtonStyle.Link).setURL("https://medal.tv/download").setEmoji("📥"),
    new ButtonBuilder().setCustomId("setup_link_medal").setLabel("Link Medal Account").setStyle(ButtonStyle.Primary).setEmoji("🎬"),
  );

  await channel.send({
    content: [
      `### 2 — Install Medal.tv`,
      `Auto-records gameplay. Press F8 after each match to save a clip. Bot pulls it automatically.`,
      `*Medal user ID: go to your Medal profile on web, number in the URL.*`,
    ].join("\n"),
    components: [step2],
  });

  // ── Step 3: Deposit ──
  const step3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Open Wallet").setStyle(ButtonStyle.Link).setURL("http://localhost:3000/wallet").setEmoji("💰"),
  );

  await channel.send({
    content: `### 3 — Deposit MP\n100 MP = $1.00. Sign in with Discord on the website.`,
    components: [step3],
  });

  // ── Step 4: Done ──
  await channel.send([
    `### 4 — You're Set`,
    `Head to **#find-match** and right-click someone to challenge them.`,
    `Check your status: \`/reputation\` · Check your balance: \`/balance\``,
  ].join("\n"));

  console.log("✅ #setup-guide posted!");
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
