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

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const channel = channels.find(c => c?.type === ChannelType.GuildText && c.name === "setup-guide") as TextChannel | undefined;
  if (!channel) { console.log("Not found"); process.exit(1); }

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
    `\`1.\` **Challenge** — right-click a player → Challenge to Wager`,
    `\`2.\` **Accept** — opponent clicks Accept, MP locked, private thread opens`,
    `\`3.\` **Rules** — game rules shown, agree on any custom rules, both confirm`,
    `\`4.\` **Ready** — both click Ready when in the game lobby`,
    `\`5.\` **Play** — match goes live`,
    `\`6.\` **Match Over** — both click Match Over`,
    `\`7.\` **Screenshot** — drop your score screen screenshot in the thread`,
    `\`8.\` **Settle** — Quick Settle if you both agree, or mod reviews screenshots`,
    ``,
    `Reports are blind — neither player sees the other's answer.`,
    `**No screenshot in a dispute = you lose. Fake results = instant permaban.**`,
  ].join("\n"));

  // ── Post 3: Setup Header ──
  await channel.send(`## Real Competition Setup\nComplete these steps once to unlock real-money competitions.`);

  // ── Step 1: Link Game Account ──
  const step1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup_link_steam").setLabel("Link Steam").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_xbox").setLabel("Link Xbox").setStyle(ButtonStyle.Primary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_riot").setLabel("Link Riot").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
    new ButtonBuilder().setCustomId("setup_link_ea").setLabel("Link EA").setStyle(ButtonStyle.Secondary).setEmoji("🎮"),
  );

  await channel.send({
    content: `### 1 — Link a Game Account\nRequired. Steam & Xbox are verified. Others saved on trust.`,
    components: [step1],
  });

  // ── Step 2: Evidence Setup ──
  const step2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Download Medal (Optional)").setStyle(ButtonStyle.Link).setURL("https://medal.tv/download").setEmoji("📥"),
    new ButtonBuilder().setCustomId("setup_link_medal").setLabel("Link Medal Account").setStyle(ButtonStyle.Secondary).setEmoji("🎬"),
  );

  await channel.send({
    content: [
      `### 2 — Evidence Capture`,
      `After every match you need to screenshot the final score screen and drop it in the match thread.`,
      ``,
      `**How to screenshot:**`,
      `• **PC:** Win+Shift+S (Windows) or Cmd+Shift+4 (Mac) → paste in thread`,
      `• **Xbox:** Xbox button + Y → share from Xbox app on phone → paste in thread`,
      `• **PlayStation:** Share button → share from PS app on phone → paste in thread`,
      `• **Game clips** from any source are also accepted`,
      ``,
      `**Optional:** Install Medal.tv (PC, free) for automatic clip capture. The bot can pull your clips automatically.`,
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
    `\`/reputation\` — check your tier and max stake`,
    `\`/balance\` — check your MP and FP`,
  ].join("\n"));

  console.log("✅ #setup-guide updated!");
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
