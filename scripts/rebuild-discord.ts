/**
 * Rebuilds the Discord server:
 * - Removes unnecessary channels
 * - Updates all messages with legal framework
 * - Cleans up channel structure
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

  // ── List current channels ──
  console.log("\n── Current Channels ──");
  for (const [, ch] of channels) {
    if (!ch) continue;
    console.log(`  ${ch.type === ChannelType.GuildCategory ? "📁" : "#"} ${ch.name} (${ch.id})`);
  }

  // ── Delete unnecessary channels ──
  const toDelete = ["active-wagers", "evidence", "clips", "free-results"];
  console.log("\n── Removing Unnecessary Channels ──");
  for (const name of toDelete) {
    const ch = channels.find(c => c?.type === ChannelType.GuildText && c.name === name);
    if (ch) {
      await ch.delete("Cleanup for MVP launch");
      console.log(`  ✗ Deleted #${name}`);
    }
  }

  // ── Helper: find channel by name ──
  const findChannel = (name: string) =>
    channels.find(c => c?.type === ChannelType.GuildText && c.name === name) as TextChannel | undefined;

  // ── Helper: clear and post ──
  async function updateChannel(name: string, messages: (string | { content: string; components?: any[] })[]) {
    const ch = findChannel(name);
    if (!ch) { console.log(`  ⚠ #${name} not found`); return; }

    const msgs = await ch.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }

    for (const m of messages) {
      if (typeof m === "string") {
        await ch.send(m);
      } else {
        await ch.send(m);
      }
    }
    console.log(`  ✓ Updated #${name}`);
  }

  // ══════════════════════════════════════
  // ── UPDATE CHANNEL CONTENT ──
  // ══════════════════════════════════════

  console.log("\n── Updating Channel Content ──");

  // ── #welcome ──
  await updateChannel("welcome", [
    [
      `# Welcome to MATCHPOINT ⚔️`,
      ``,
      `Skill-based competitive gaming. Challenge anyone. Winner takes the pot.`,
      ``,
      `**🎮 Free Play** — no setup, no money, jump in now:`,
      `→ \`/daily\` for 1,000 FP → right-click any player → Freeplay Challenge`,
      ``,
      `**💰 Real Competitions** — stake MP, prove your skill:`,
      `→ See **#setup-guide** to get started`,
      ``,
      `> ⚠️ MATCHPOINT is a skill-based competitive gaming platform. All competitions are contests of skill where the outcome is determined by the participants' ability. MATCHPOINT does not offer, facilitate, or promote games of chance.`,
      `> All participation is voluntary. There is a risk of loss. Never stake more than you can afford to lose.`,
      `> You must be 18+ to participate in real-money competitions.`,
    ].join("\n"),
  ]);

  // ── #rules ──
  await updateChannel("rules", [
    [
      `# Rules`,
      ``,
      `**1. Zero tolerance for fake results.**`,
      `Fake screenshots, lying about results, or forged evidence = instant permanent ban. All linked game accounts blacklisted. No warnings. No appeals.`,
      ``,
      `**2. Always screenshot the score screen.**`,
      `After every match, drop a screenshot of the final score in your match thread. No screenshot in a dispute = you lose, every time.`,
      ``,
      `**3. Blind reporting.**`,
      `Both players report independently. Neither sees the other's answer. If you report first, opponent has 15 minutes to respond. No response = your result stands.`,
      ``,
      `**4. Respect deadlines.**`,
      `90 minutes to play and report. No-shows receive a reputation penalty and strike.`,
      ``,
      `**5. No collusion.**`,
      `Alternating wins with the same person to farm MP = both accounts permanently banned.`,
      ``,
      `**6. One account per person.**`,
      `Alt accounts = all accounts banned.`,
      ``,
      `**7. Link your accounts.**`,
      `Real competitions require a linked game account. See #setup-guide.`,
      ``,
      `**8. Disputes.**`,
      `Both claim victory → dispute opens. Mod reviews screenshots. No screenshot = you lose. Fake screenshot = permaban. Mod decision is final.`,
      ``,
      `**9. Be respectful.**`,
      `Competitive banter is fine. Harassment, slurs, and threats are not.`,
    ].join("\n"),
    [
      `## Enforcement`,
      ``,
      `| Offense | Action |`,
      `|---------|--------|`,
      `| No-show | -10 rep + strike |`,
      `| 3 strikes | Permanent ban |`,
      `| Fake result / forged evidence | Instant permaban |`,
      `| Collusion | Both accounts permabanned |`,
      `| Alt account | All accounts banned |`,
      `| Harassment | Warning → kick → ban |`,
    ].join("\n"),
  ]);

  // ── #setup-guide ──
  // (Already has interactive buttons from previous script — just refresh the header)

  // ── #wager-limits ──
  // (Already posted — leave as is)

  // ── #link-accounts ──
  await updateChannel("link-accounts", [
    [
      `# Link Your Game Accounts`,
      ``,
      `Required for real competitions. Proves you own your gamertag.`,
      ``,
      `**✅ Verified (code-in-bio):**`,
      `\`/link platform:Steam username:YourSteamID\``,
      `\`/link platform:Xbox username:YourGamertag\``,
      ``,
      `**📋 Saved (unverified):**`,
      `\`/link platform:Riot username:Name#TAG\``,
      `\`/link platform:EA username:YourEAID\``,
      `\`/link platform:Epic username:YourEpicName\``,
      `\`/link platform:Activision username:YourActiID\``,
      ``,
      `**🎬 Medal.tv (clip capture):**`,
      `\`/link platform:Medal.tv username:YourMedalUserID\``,
      ``,
      `If you get banned, your linked gamertags are blacklisted too.`,
    ].join("\n"),
  ]);

  // ── #find-match — just clear old messages ──
  const findMatch = findChannel("find-match");
  if (findMatch) {
    const msgs = await findMatch.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #find-match`);
  }

  // ── #results — just clear ──
  const results = findChannel("results");
  if (results) {
    const msgs = await results.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #results`);
  }

  // ── #disputes — just clear ──
  const disputes = findChannel("disputes");
  if (disputes) {
    const msgs = await disputes.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #disputes`);
  }

  // ── #general — clear ──
  const general = findChannel("general");
  if (general) {
    const msgs = await general.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #general`);
  }

  // ── #free-play — clear ──
  const freePlay = findChannel("free-play");
  if (freePlay) {
    const msgs = await freePlay.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #free-play`);
  }

  // ── #leaderboard — clear ──
  const leaderboard = findChannel("leaderboard");
  if (leaderboard) {
    const msgs = await leaderboard.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log(`  ✓ Cleared #leaderboard`);
  }

  console.log("\n══════════════════════════════════════");
  console.log("✅ Discord server rebuilt!");
  console.log("\nFinal channel structure:");
  console.log("📋 INFO: #welcome, #rules, #setup-guide, #wager-limits, #link-accounts");
  console.log("🎮 WAGER: #find-match, #results");
  console.log("💬 COMMUNITY: #general");
  console.log("⚠️ DISPUTES: #disputes");
  console.log("📊 STATS: #leaderboard");
  console.log("🆓 FREE PLAY: #free-play");
  console.log("══════════════════════════════════════\n");

  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
