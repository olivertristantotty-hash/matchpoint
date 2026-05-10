/**
 * Sets up Discord native Onboarding:
 * - Creates a per-game role for each supported game (idempotent)
 * - Creates a GAMES category with #<game>-wagers channel per game, gated to its role
 * - Configures Discord's native Onboarding prompt "Which games do you play?"
 *   mapping each answer to its corresponding role + channel
 *
 * After running this, new members see the native Discord onboarding modal
 * on join, tick the games they play, and only the channels for those games
 * unlock. No bot interaction required for this step.
 *
 * Requires: Community features enabled on the guild (Server Settings → Enable Community).
 * If not enabled, editOnboarding() will throw — enable it in the UI first.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  GuildOnboardingPromptType,
  CategoryChannel,
  TextChannel,
  Role,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

// ── Game definitions (mirrors src/services/games/profiles.ts) ──

interface GameDef {
  key: string;           // matches profiles.ts key
  displayName: string;   // shown in onboarding prompt
  roleName: string;      // role granted on selection
  roleColor: number;
  channelName: string;   // #<name>-wagers
  emoji: string;         // shown in prompt option
  description: string;   // prompt option description
}

const GAMES: GameDef[] = [
  {
    key: "valorant",
    displayName: "Valorant",
    roleName: "Valorant",
    roleColor: 0xFF4655,
    channelName: "valorant-wagers",
    emoji: "🎯",
    description: "1v1 custom matches, Riot API verified",
  },
  {
    key: "lol",
    displayName: "League of Legends",
    roleName: "LoL",
    roleColor: 0x1E90FF,
    channelName: "lol-wagers",
    emoji: "🗡️",
    description: "Summoner's Rift 1v1, Riot API verified",
  },
  {
    key: "cod",
    displayName: "Call of Duty",
    roleName: "Call of Duty",
    roleColor: 0x1B1B1B,
    channelName: "cod-wagers",
    emoji: "🔫",
    description: "BO6, MW3, Warzone — screenshot verified",
  },
  {
    key: "fifa",
    displayName: "EA FC / FIFA",
    roleName: "EA FC",
    roleColor: 0x00A859,
    channelName: "ea-fc-wagers",
    emoji: "⚽",
    description: "Online Friendlies — screenshot verified",
  },
  {
    key: "fortnite",
    displayName: "Fortnite",
    roleName: "Fortnite",
    roleColor: 0x8E44AD,
    channelName: "fortnite-wagers",
    emoji: "🏆",
    description: "Box Fights / Zone Wars 1v1",
  },
  {
    key: "rocketleague",
    displayName: "Rocket League",
    roleName: "Rocket League",
    roleColor: 0x2196F3,
    channelName: "rocket-league-wagers",
    emoji: "🚗",
    description: "Private match 1v1",
  },
  {
    key: "nba2k",
    displayName: "NBA 2K",
    roleName: "NBA 2K",
    roleColor: 0xC9082A,
    channelName: "nba-2k-wagers",
    emoji: "🏀",
    description: "Play Now Online head-to-head",
  },
  {
    key: "madden",
    displayName: "Madden NFL",
    roleName: "Madden",
    roleColor: 0x013369,
    channelName: "madden-wagers",
    emoji: "🏈",
    description: "Head to Head — screenshot verified",
  },
  {
    key: "mariokart",
    displayName: "Mario Kart",
    roleName: "Mario Kart",
    roleColor: 0xE60012,
    channelName: "mario-kart-wagers",
    emoji: "🏁",
    description: "VS Race — screenshot verified",
  },
];

const CATEGORY_NAME = "GAMES";

// Channels that should always be visible to @everyone (onboarding default channels).
// Discord requires at least 7 @everyone-readable channels for Community onboarding.
const DEFAULT_CHANNELS = [
  "welcome",
  "rules",
  "setup-guide",
  "wager-limits",
  "link-accounts",
  "general",
  "results",
  "leaderboard",
];

// ── Main ──

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();

  // ── Step 1: Ensure per-game roles exist ──

  console.log("\n── Per-Game Roles ──");
  const roles = new Map<string, Role>();

  for (const g of GAMES) {
    const existing = guild.roles.cache.find((r) => r.name === g.roleName);
    if (existing) {
      roles.set(g.key, existing);
      console.log(`  ⏭  @${g.roleName} exists`);
    } else {
      const role = await guild.roles.create({
        name: g.roleName,
        color: g.roleColor,
        hoist: false,
        mentionable: true,
        reason: "Per-game role for onboarding",
      });
      roles.set(g.key, role);
      console.log(`  ✓  Created @${g.roleName}`);
    }
  }

  // ── Step 2: Ensure GAMES category exists ──

  console.log("\n── GAMES Category ──");
  let gamesCategory = guild.channels.cache.find(
    (c) => c?.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
  ) as CategoryChannel | undefined;

  if (!gamesCategory) {
    gamesCategory = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Game-gated wager channels",
    });
    console.log(`  ✓  Created category ${CATEGORY_NAME}`);
  } else {
    console.log(`  ⏭  Category ${CATEGORY_NAME} exists`);
  }

  // Hide category itself from @everyone; roles grant visibility per-channel.
  await gamesCategory.permissionOverwrites.set([
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ]);

  // ── Step 3: Ensure per-game channels exist, gated to the game role ──

  console.log("\n── Per-Game Channels ──");
  const channelIdByKey = new Map<string, string>();

  for (const g of GAMES) {
    const role = roles.get(g.key)!;
    let channel = guild.channels.cache.find(
      (c) => c?.type === ChannelType.GuildText && c.name === g.channelName,
    ) as TextChannel | undefined;

    if (!channel) {
      channel = await guild.channels.create({
        name: g.channelName,
        type: ChannelType.GuildText,
        parent: gamesCategory.id,
        topic: `${g.displayName} wagers & free-play matchmaking`,
        reason: "Game-gated channel",
      });
      console.log(`  ✓  Created #${g.channelName}`);
    } else {
      // Move under the category if it isn't already
      if (channel.parentId !== gamesCategory.id) {
        await channel.setParent(gamesCategory.id, { lockPermissions: false });
      }
      console.log(`  ⏭  #${g.channelName} exists`);
    }

    // Lock to the role: @everyone denied, role allowed
    await channel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: role.id,
        type: OverwriteType.Role,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: client.user!.id,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ]);

    channelIdByKey.set(g.key, channel.id);
  }

  // ── Step 4: Resolve default channels for onboarding ──
  // Discord requires default_channel_ids (at least 7) — channels @everyone can read.

  const defaultChannelIds: string[] = [];
  for (const name of DEFAULT_CHANNELS) {
    const ch = guild.channels.cache.find(
      (c) => c?.type === ChannelType.GuildText && c.name === name,
    );
    if (ch) defaultChannelIds.push(ch.id);
    else console.log(`  ⚠  Default channel #${name} not found (skipping)`);
  }

  if (defaultChannelIds.length < 7) {
    console.log(
      `\n  ⚠  Only ${defaultChannelIds.length} default channels found. Discord requires 7+ for Community onboarding.`,
    );
    console.log(`     Missing channels will need to be created before onboarding can be enabled.`);
  }

  // ── Step 5: Configure native Discord Onboarding ──

  console.log("\n── Discord Native Onboarding ──");

  try {
    await guild.editOnboarding({
      enabled: true,
      mode: 0, // 0 = ONBOARDING_DEFAULT (guild + app-defined channels count toward constraints)
      defaultChannels: defaultChannelIds,
      prompts: [
        {
          type: GuildOnboardingPromptType.MultipleChoice,
          title: "Which games do you play?",
          singleSelect: false, // allow multiple
          required: true,
          inOnboarding: true,
          options: GAMES.map((g) => ({
            title: g.displayName,
            description: g.description,
            emoji: g.emoji,
            roles: [roles.get(g.key)!.id],
            channels: [channelIdByKey.get(g.key)!],
          })),
        },
      ],
      reason: "Set up game-picker onboarding",
    });
    console.log("  ✓  Onboarding prompt configured");
  } catch (err: any) {
    console.error("\n  ✗  Failed to configure onboarding:", err.message);
    console.error("\n  Common causes:");
    console.error("    • Community features not enabled (Server Settings → Enable Community)");
    console.error("    • Bot missing MANAGE_GUILD permission");
    console.error("    • Fewer than 7 @everyone-readable default channels");
    console.error("\n  Roles and channels were created successfully — re-run after fixing the above.");
    await client.destroy();
    process.exit(1);
  }

  // ── Summary ──

  console.log("\n══════════════════════════════════════");
  console.log("✅ Onboarding set up!");
  console.log("\nWhat happens now:");
  console.log("  • New members see the native Discord onboarding modal on join");
  console.log("  • They tick the games they play");
  console.log("  • Each selection grants the matching @Role");
  console.log("  • Only channels for their games are visible");
  console.log("\nGame channels created:");
  for (const g of GAMES) {
    console.log(`  #${g.channelName}  → @${g.roleName}`);
  }
  console.log("\nTo adjust prompts, edit in Server Settings → Onboarding, or re-run this script.");
  console.log("══════════════════════════════════════\n");

  await client.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
