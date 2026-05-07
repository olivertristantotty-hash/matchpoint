import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits, ChannelType, TextChannel, OverwriteType, PermissionFlagsBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  // Find the INFO category (where setup-guide lives)
  const infoCategory = channels.find(c => c?.type === ChannelType.GuildCategory && c.name.includes("INFO"));

  // Find or create #wager-limits
  let channel = channels.find(c => c?.type === ChannelType.GuildText && c.name === "wager-limits") as TextChannel | undefined;

  if (!channel) {
    channel = await guild.channels.create({
      name: "wager-limits",
      type: ChannelType.GuildText,
      parent: infoCategory?.id,
      topic: "Reputation tiers and wager limits",
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: client.user!.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.SendMessages],
        },
      ],
    }) as TextChannel;
    console.log("Created #wager-limits");
  } else {
    // Clear existing
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const [, msg] of msgs) { try { await msg.delete(); } catch {} }
    console.log("Cleared #wager-limits");
  }

  // ── Post content ──

  await channel.send([
    `# Reputation & Wager Limits`,
    ``,
    `Your **reputation score** determines how much you can wager. Everyone starts at **100 rep**.`,
    ``,
    `Higher rep = higher stakes. Play fair, build trust, unlock bigger wagers.`,
  ].join("\n"));

  await channel.send([
    `## Tiers`,
    ``,
    `\`🚫  0-49   Untrusted\` — Freeplay only, no real wagers`,
    `\`⚠️  50-99  Caution  \` — Max wager: **250 MP** ($2.50)`,
    `\`✅ 100-149 Good     \` — Max wager: **500 MP** ($5.00)`,
    `\`⭐ 150-299 Trusted  \` — Max wager: **1,000 MP** ($10.00)`,
    `\`🏆 300-499 Veteran  \` — Max wager: **2,500 MP** ($25.00)`,
    `\`💎 500-999 Elite    \` — Max wager: **5,000 MP** ($50.00)`,
    `\`👑 1000+   Legend   \` — Max wager: **10,000 MP** ($100.00)`,
    ``,
    `Freeplay has **no limits** — wager any amount of FP regardless of rep.`,
  ].join("\n"));

  await channel.send([
    `## How Rep Changes`,
    ``,
    `**Gain rep:**`,
    `\`+2\` — honest match report (both players agree)`,
    `\`+5\` — winning a dispute (you were right)`,
    ``,
    `**Lose rep:**`,
    `\`-10\` — no-show (didn't report in time) + 1 strike`,
    ``,
    `**Instant permaban:**`,
    `Fake results, forged evidence, or losing a dispute (you lied). All linked game accounts blacklisted.`,
    ``,
    `3 strikes from no-shows = ban.`,
  ].join("\n"));

  await channel.send([
    `## Check Your Status`,
    ``,
    `\`/reputation\` — see your tier, score, and max wager`,
    `\`/reputation @user\` — check anyone else's`,
    `Right-click a player → Apps → **View Reputation**`,
  ].join("\n"));

  console.log("✅ #wager-limits posted!");
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
