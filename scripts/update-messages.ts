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

Challenge anyone. Stake tokens. Winner takes the pot.

**🆓 Free Play — no money, just bragging rights:**
→ \`/daily\` — claim 1,000 free coins every 24 hours
→ \`/freeplay @opponent game amount\` — challenge someone with free coins

**💰 Real Wagers — when you're ready for stakes:**
→ \`/wager @opponent game amount\` — challenge someone with real tokens
→ Requires a linked & verified game account

**Getting started:**
→ \`/link\` — connect your Steam, Xbox, or other game accounts
→ \`/balance\` — check your tokens and free coins
→ \`/reputation\` — check your trust score

Head to **#free-play** to start with free coins, or **#find-match** for real wagers.`;

const RULES = `**MATCHPOINT Rules**

**1. Zero tolerance for fake results.**
Submitting a fake screenshot, lying about a result, or forging evidence = **instant permanent ban**. No warnings. No appeals. Your linked game accounts will also be blacklisted.

**2. Report your results.**
After every match, both players report who won using the buttons in your wager thread. If you report first, your opponent has 15 minutes to confirm or dispute. No response = your result stands.

**3. Respect deadlines.**
You have 90 minutes to play and report after a wager is accepted. No-shows get a reputation penalty.

**4. No collusion.**
Alternating wins with the same person to farm tokens = both accounts permanently banned.

**5. Disputes are public.**
If there's a disagreement, it goes to #disputes. Post your evidence in the wager thread. Mods review and decide. Their call is final.

**6. Link your accounts.**
Real wagers require a linked game account. Use \`/link\` to connect your Steam, Xbox, or other platform. Steam and Xbox accounts are verified — you prove you own them.

**7. One account per person.**
Alt accounts are not allowed. If caught, all accounts get banned.

**8. Be cool.**
Trash talk is part of the game. Harassment, slurs, and threats are not. Zero tolerance.`;

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
