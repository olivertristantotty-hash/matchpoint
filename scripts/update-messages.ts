/**
 * Updates the #welcome, #rules, and #link-accounts channel messages.
 * Deletes old messages and posts fresh ones.
 *
 * Usage: npx tsx scripts/update-messages.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits, ChannelType, TextChannel } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

if (!TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN or GUILD_ID in scripts/.env");
  process.exit(1);
}

// ── Messages ──

const WELCOME = `**Welcome to MATCHPOINT** ⚔️

Challenge anyone. Stake MP. Winner takes the pot.

**🆓 Free Play — no money, just bragging rights:**
→ \`/daily\` — claim 1,000 FP every 24 hours
→ \`/freeplay @opponent game amount\` — challenge someone with FP

**💰 Real Wagers — when you're ready for stakes:**
→ \`/wager @opponent game amount\` — challenge someone with real MP
→ Requires a linked & verified game account

**Getting started:**
→ \`/link\` — connect your Steam, Xbox, or other game accounts
→ \`/balance\` — check your MP and FP
→ \`/reputation\` — check your trust score

Head to **#free-play** to start with FP, or **#find-match** for real wagers.`;

const RULES = `**MATCHPOINT Rules**

**1. Zero tolerance for fake results.**
Fake screenshots, lying about results, or forged evidence = **instant permanent ban**. No warnings. No appeals. Linked game accounts get blacklisted.

**2. Always screenshot the score screen.**
After every match, drop a screenshot of the final score in your wager thread. **No screenshot in a dispute = you lose, every time.** It takes 2 seconds — protect yourself.

**3. Report your results.**
Both players report who won using the buttons in the thread. Reports are blind — neither sees the other's answer. If you report first, opponent has 15 minutes. No response = your result stands.

**4. Respect deadlines.**
90 minutes to play and report. No-shows get a reputation penalty.

**5. No collusion.**
Alternating wins with the same person to farm MP = both accounts permanently banned.

**6. Disputes.**
Both claim they won → dispute opens. Mod reviews the screenshots. Player without a screenshot loses. Fake screenshot = permaban.

**7. Link your accounts.**
Real wagers require a linked game account. Use \`/link\` to connect your platform.

**8. One account per person.**
Alt accounts = all accounts banned.

**9. Be cool.**
Trash talk is fine. Harassment is not.`;

const LINK_ACCOUNTS = `**Link Your Game Accounts**

Linking proves you own your gamertag and unlocks real-money wagers.

**✅ Verified platforms (code-in-bio):**
\`/link platform:Steam username:YourSteamID\`
\`/link platform:Xbox username:YourGamertag\`
→ The bot gives you a unique code to put in your profile
→ Click Verify, bot checks your profile, done
→ You can remove the code after

**📋 Other platforms (saved but unverified):**
\`/link platform:Riot username:YourName#TAG\` — League / Valorant
\`/link platform:EA username:YourEAID\` — FIFA / EA FC
\`/link platform:Epic username:YourEpicName\` — Fortnite
\`/link platform:Activision username:YourActiID\` — Call of Duty

**Why link?**
• Required for real-money wagers
• Verified accounts show ✅ on your profile
• If you get banned, your linked gamertags are blacklisted too — can't just make a new Discord account

**Freeplay doesn't require linking** — use \`/daily\` and \`/freeplay\` right away.`;

// ── Main ──

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);

  const channels = await guild.channels.fetch();

  async function updateChannel(name: string, content: string) {
    const channel = channels.find(c => c?.type === ChannelType.GuildText && c.name === name) as TextChannel | undefined;
    if (!channel) {
      console.log(`  ⚠ #${name} not found, skipping`);
      return;
    }

    // Delete all existing messages
    const messages = await channel.messages.fetch({ limit: 50 });
    for (const [, msg] of messages) {
      try { await msg.delete(); } catch {}
    }

    // Post new message
    await channel.send(content);
    console.log(`  ✓ Updated #${name}`);
  }

  console.log("\n── Updating Messages ──");
  await updateChannel("welcome", WELCOME);
  await updateChannel("rules", RULES);
  await updateChannel("link-accounts", LINK_ACCOUNTS);

  console.log("\n✅ Done!");
  await client.destroy();
  process.exit(0);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
