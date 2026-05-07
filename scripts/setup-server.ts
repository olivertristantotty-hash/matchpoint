/**
 * Discord Server Setup Script (Standalone)
 *
 * Creates all channels, roles, permissions, and posts
 * welcome/rules/link-accounts messages.
 *
 * No database, no API keys, no wager bot needed.
 * Just a Discord bot token and a server ID.
 *
 * Setup:
 *   1. Go to https://discord.com/developers/applications
 *   2. Create a new application → go to Bot tab → Reset Token → copy it
 *   3. OAuth2 → URL Generator → scopes: bot, applications.commands
 *      → permissions: Administrator → copy URL → open in browser → select server
 *   4. Run this script:
 *
 *      npx tsx scripts/setup-server.ts
 *
 *   Environment variables (set in scripts/.env or pass inline):
 *     DISCORD_TOKEN  — your bot token
 *     GUILD_ID       — right-click server name → Copy Server ID
 *     SERVER_NAME    — optional, defaults to "Stakehouse"
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load from scripts/.env if it exists, otherwise root .env
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  TextChannel,
  CategoryChannel,
  Role,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SERVER_NAME = process.env.SERVER_NAME || "Stakehouse";

if (!TOKEN || !GUILD_ID) {
  console.error(`
╔══════════════════════════════════════════════════════╗
║  Missing DISCORD_TOKEN or GUILD_ID                   ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Option 1: Create scripts/.env with:                 ║
║    DISCORD_TOKEN=your_bot_token                      ║
║    GUILD_ID=your_server_id                           ║
║    SERVER_NAME=Stakehouse                            ║
║                                                      ║
║  Option 2: Pass inline:                              ║
║    DISCORD_TOKEN=xxx GUILD_ID=xxx npx tsx             ║
║      scripts/setup-server.ts                         ║
║                                                      ║
║  How to get these:                                   ║
║  • Bot token: discord.com/developers/applications    ║
║    → your app → Bot → Reset Token                    ║
║  • Guild ID: right-click server name → Copy Server ID║
║    (enable Developer Mode in Discord settings first) ║
╚══════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

// ── Roles ──

const ROLES = [
  { name: "Admin", color: 0xe74c3c, hoist: true },
  { name: "Moderator", color: 0xe67e22, hoist: true },
  { name: "Trusted", color: 0xf1c40f, hoist: true },
  { name: "Verified", color: 0x2ecc71, hoist: true },
  { name: "Steam Verified", color: 0x1b2838, hoist: false },
  { name: "Xbox Verified", color: 0x107c10, hoist: false },
  { name: "Riot Linked", color: 0xd13639, hoist: false },
  { name: "EA Linked", color: 0x0e1c2b, hoist: false },
  { name: "Epic Linked", color: 0x2f2f2f, hoist: false },
  { name: "Activision Linked", color: 0x1e6b0a, hoist: false },
];

// ── Channel Definitions ──

interface ChannelDef {
  name: string;
  topic: string;
  botOnly?: boolean;
  modSend?: boolean;
  allowAttach?: boolean;
  readOnly?: boolean;
}

interface CategoryDef {
  name: string;
  emoji: string;
  channels: ChannelDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    name: "INFO",
    emoji: "📋",
    channels: [
      { name: "welcome", topic: "Welcome! Read this first.", readOnly: true },
      { name: "rules", topic: "Server rules. Read before wagering.", readOnly: true },
      { name: "link-accounts", topic: "How to connect your game accounts for auto-verification.", readOnly: true },
    ],
  },
  {
    name: "WAGER",
    emoji: "🎮",
    channels: [
      { name: "find-match", topic: "Post what game you want to play and how much you want to wager. Use /wager to make it official." },
      { name: "active-wagers", topic: "Live wagers. Bot posts here automatically.", botOnly: true },
      { name: "results", topic: "Match results. See who's winning.", botOnly: true },
    ],
  },
  {
    name: "COMMUNITY",
    emoji: "💬",
    channels: [
      { name: "general", topic: "Talk about whatever. Keep it chill." },
      { name: "clips", topic: "Post your best plays, clutch moments, and highlights.", allowAttach: true },
    ],
  },
  {
    name: "DISPUTES",
    emoji: "⚠️",
    channels: [
      { name: "disputes", topic: "Active disputes. Mods use /resolve to settle.", botOnly: true, modSend: true },
      { name: "evidence", topic: "Submit screenshots and clips for disputed matches here.", allowAttach: true },
    ],
  },
  {
    name: "STATS",
    emoji: "📊",
    channels: [
      { name: "leaderboard", topic: "Top players updated weekly.", botOnly: true },
    ],
  },
  {
    name: "FREE PLAY",
    emoji: "🆓",
    channels: [
      { name: "free-play", topic: "Wager FP — no real money. Use /daily to claim FP, /freeplay to challenge someone." },
      { name: "free-results", topic: "Freeplay match results.", botOnly: true },
    ],
  },
];

// ── Messages ──

function getWelcomeMessage(findMatchId?: string) {
  const findMatchLink = findMatchId ? `<#${findMatchId}>` : "#find-match";
  return `**Welcome to ${SERVER_NAME}! 🎮**

Challenge anyone to a match. Stake MP. Winner takes the pot.

**Get started in 30 seconds:**
→ \`/deposit 1000\` — grab free starter MP
→ \`/wager @opponent game amount\` — challenge someone
→ \`/link\` — connect your game accounts for auto-verified results

Head to ${findMatchLink} to find an opponent. Good luck.`;
}

const RULES_MESSAGE = `**Rules**

1. **No fake results.** Submitting a fake screenshot or lying about a result = strike. 3 strikes = permanent ban.

2. **Submit screenshots.** After every match, both players submit a screenshot of the final score using \`/submit\`. The system reads it automatically.

3. **Respect deadlines.** You have 90 minutes to play and submit after a wager is accepted. No-shows get a reputation penalty.

4. **No collusion.** Alternating wins with the same person to farm MP will get both accounts banned.

5. **Disputes are public.** If there's a disagreement, it goes to #disputes. Mods review evidence and decide. Their call is final.

6. **Be cool.** Trash talk is fine. Harassment is not.`;

const LINK_MESSAGE = `**Link Your Game Accounts**

Linking lets the bot verify your match results automatically — no screenshots needed for supported games.

\`/link platform:Riot username:YourName#TAG\` — League of Legends & Valorant
\`/link platform:EA username:YourEAID\` — FIFA / EA FC
\`/link platform:Steam username:YourSteamID\` — Rocket League
\`/link platform:Epic username:YourEpicName\` — Fortnite
\`/link platform:Activision username:YourActiID\` — Call of Duty

**Auto-verified games:** League of Legends, Valorant (via Riot API)
**Screenshot-verified:** FIFA, Rocket League, CoD, Fortnite

You can wager without linking — you'll just need to submit screenshots manually.`;

// ── Main ──

async function main() {
  console.log(`\n🚀 WagerBot Server Setup\n`);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`✓ Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID!);
  console.log(`✓ Found server: ${guild.name} (${guild.id})\n`);

  // Rename server
  if (guild.name !== SERVER_NAME) {
    await guild.setName(SERVER_NAME);
    console.log(`✓ Renamed server to: ${SERVER_NAME}\n`);
  }

  // ── Roles ──
  console.log(`── Roles ──`);
  const createdRoles: Record<string, Role> = {};

  for (const def of ROLES) {
    const existing = guild.roles.cache.find(r => r.name === def.name);
    if (existing) {
      createdRoles[def.name] = existing;
      console.log(`  ⏭ @${def.name} already exists`);
    } else {
      const role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
        reason: "WagerBot server setup",
      });
      createdRoles[def.name] = role;
      console.log(`  ✓ Created @${def.name}`);
    }
  }

  const everyoneRole = guild.roles.everyone;
  const modRole = createdRoles["Moderator"];

  // ── Channels ──
  console.log(`\n── Channels ──`);
  const channelMap: Record<string, TextChannel> = {};

  for (const cat of CATEGORIES) {
    // Find or create category
    let category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.includes(cat.name)
    ) as CategoryChannel | undefined;

    if (!category) {
      category = await guild.channels.create({
        name: `${cat.emoji} ${cat.name}`,
        type: ChannelType.GuildCategory,
        reason: "WagerBot server setup",
      });
      console.log(`\n  ✓ Category: ${cat.emoji} ${cat.name}`);
    } else {
      console.log(`\n  ⏭ Category: ${cat.name} exists`);
    }

    for (const chDef of cat.channels) {
      // Check if exists in this category
      let channel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === chDef.name && c.parentId === category!.id
      ) as TextChannel | undefined;

      if (channel) {
        channelMap[chDef.name] = channel;
        console.log(`    ⏭ #${chDef.name} exists`);
        continue;
      }

      // Build permissions
      const overwrites: any[] = [];

      if (chDef.readOnly || chDef.botOnly) {
        overwrites.push({
          id: everyoneRole.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        });
        overwrites.push({
          id: client.user!.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
        });
        if (chDef.modSend && modRole) {
          overwrites.push({
            id: modRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.SendMessages],
          });
        }
      }

      if (chDef.allowAttach) {
        // Find existing everyone overwrite and add attach, or create new
        const existingEveryone = overwrites.find((o: any) => o.id === everyoneRole.id);
        if (existingEveryone) {
          existingEveryone.allow = [...(existingEveryone.allow || []), PermissionFlagsBits.AttachFiles];
        } else {
          overwrites.push({
            id: everyoneRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
          });
        }
      }

      channel = await guild.channels.create({
        name: chDef.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: chDef.topic,
        permissionOverwrites: overwrites.length > 0 ? overwrites : undefined,
        reason: "WagerBot server setup",
      }) as TextChannel;

      channelMap[chDef.name] = channel;
      console.log(`    ✓ #${chDef.name}`);
    }
  }

  // ── Post Messages ──
  console.log(`\n── Messages ──`);

  const postIfEmpty = async (channelName: string, content: string) => {
    const ch = channelMap[channelName];
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 1 });
    if (msgs.size > 0) {
      console.log(`  ⏭ #${channelName} already has content`);
      return;
    }
    await ch.send(content);
    console.log(`  ✓ Posted in #${channelName}`);
  };

  await postIfEmpty("welcome", getWelcomeMessage(channelMap["find-match"]?.id));
  await postIfEmpty("rules", RULES_MESSAGE);
  await postIfEmpty("link-accounts", LINK_MESSAGE);

  // ── Summary ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Server setup complete!\n`);
  console.log(`Server: ${SERVER_NAME}`);
  console.log(`Roles:    ${Object.keys(createdRoles).map(r => `@${r}`).join(", ")}`);
  console.log(`Channels: ${Object.keys(channelMap).map(c => `#${c}`).join(", ")}`);
  console.log(`\nYou can now close this script.`);
  console.log(`When you're ready for the wager bot, set up the database and run: npm run bot`);
  console.log(`${"═".repeat(50)}\n`);

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err.message || err);
  process.exit(1);
});
