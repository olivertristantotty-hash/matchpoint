/**
 * Creates/updates a #commands channel with a full list of bot commands.
 * Uses Discord REST API directly (no gateway connection needed).
 * 
 * Usage: npx tsx scripts/setup-commands-channel.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const BOT_ID = "1492509011700875285";

const API = "https://discord.com/api/v10";
const headers = {
  Authorization: `Bot ${TOKEN}`,
  "Content-Type": "application/json",
};

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  console.log("Setting up #commands channel...\n");

  // Get guild channels
  const channels = await api("GET", `/guilds/${GUILD_ID}/channels`) as any[];

  // Find INFO category
  const infoCategory = channels.find((c: any) => c.type === 4 && c.name.includes("INFO"));

  // Find or create #commands
  let channel = channels.find((c: any) => c.type === 0 && c.name === "commands");

  if (!channel) {
    channel = await api("POST", `/guilds/${GUILD_ID}/channels`, {
      name: "commands",
      type: 0,
      parent_id: infoCategory?.id,
      topic: "All bot commands and how to use them.",
      permission_overwrites: [
        {
          id: GUILD_ID, // @everyone
          type: 0, // role
          deny: String(1 << 11), // SEND_MESSAGES
          allow: String((1 << 10) | (1 << 16)), // VIEW_CHANNEL | READ_MESSAGE_HISTORY
        },
        {
          id: BOT_ID,
          type: 1, // member
          allow: String((1 << 11) | (1 << 14)), // SEND_MESSAGES | EMBED_LINKS
        },
      ],
    });
    console.log("Created #commands");
  } else {
    console.log("Found existing #commands");
  }

  const channelId = channel.id;

  // Clear existing messages
  const messages = await api("GET", `/channels/${channelId}/messages?limit=50`) as any[];
  for (const msg of messages) {
    try { await api("DELETE", `/channels/${channelId}/messages/${msg.id}`); } catch {}
  }
  console.log(`Cleared ${messages.length} old messages`);

  // Post command reference
  const posts = [
    [
      `# Commands`,
      ``,
      `Everything you can do on MATCHPOINT.`,
    ].join("\n"),

    [
      `## Getting Started`,
      ``,
      `| Command | What it does |`,
      `|---------|-------------|`,
      `| \`/daily\` | Claim 1,000 free FP every 24 hours |`,
      `| \`/balance\` | Check your MP and FP balance |`,
      `| \`/reputation\` | Check your rep score and tier |`,
      `| \`/link platform username\` | Link a game account (Steam, Xbox, Riot, EA, Epic, Activision, Medal.tv) |`,
      `| \`/history\` | View your recent wager history |`,
      `| \`/leaderboard\` | See top players by wins, earnings, streak, or rep |`,
    ].join("\n"),

    [
      `## Challenging Players`,
      ``,
      `| Command | What it does |`,
      `|---------|-------------|`,
      `| **Right-click → Challenge to Wager** | Challenge someone to a real MP wager |`,
      `| **Right-click → Freeplay Challenge** | Challenge someone to a free FP match |`,
      `| **Right-click → View Reputation** | Check someone's rep and stats |`,
      `| \`/wager @opponent game amount\` | Same as right-click challenge (slash command version) |`,
      `| \`/freeplay @opponent game amount\` | Same as right-click freeplay (slash command version) |`,
      `| \`/host game platform amount\` | Host an open lobby — anyone can join |`,
    ].join("\n"),

    [
      `## During a Match`,
      ``,
      `| Command | What it does |`,
      `|---------|-------------|`,
      `| \`/accept wager_id\` | Accept a pending wager challenge |`,
      `| \`/submit wager_id screenshot\` | Submit a screenshot of the final score |`,
      `| \`/report wager_id result\` | Manually report win/loss (if screenshot fails) |`,
      `| \`/cancel wager_id\` | Cancel a wager you created (before it's accepted) |`,
      `| \`/lookup wager_id\` | Look up details of any wager |`,
    ].join("\n"),

    [
      `## Money`,
      ``,
      `| Action | How |`,
      `|--------|-----|`,
      `| Deposit | Visit the website → Wallet → send USDC (Solana) to your deposit address |`,
      `| Withdraw | Visit the website → Wallet → enter amount and Solana address |`,
      `| Check balance | \`/balance\` |`,
      ``,
      `100 MP = $1.00. Minimum deposit: $5. Minimum withdrawal: 1,000 MP ($10).`,
    ].join("\n"),

    [
      `## Moderation`,
      ``,
      `| Command | What it does |`,
      `|---------|-------------|`,
      `| \`/resolve dispute_id outcome\` | Resolve a dispute (mods only) |`,
      ``,
      `---`,
      ``,
      `**Tip:** Right-clicking a player is the fastest way to challenge them. You don't need to memorize any commands.`,
    ].join("\n"),
  ];

  for (const content of posts) {
    await api("POST", `/channels/${channelId}/messages`, { content });
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Posted ${posts.length} messages to #commands`);
  process.exit(0);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
