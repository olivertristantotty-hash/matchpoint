import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

// Roles in order of priority (highest first so Discord shows the right color)
const TIER_ROLES = [
  { name: "Legend",    color: 0xFFD700 },  // gold
  { name: "Elite",     color: 0x3498DB },  // blue/diamond
  { name: "Veteran",   color: 0x9B59B6 },  // purple
  { name: "Trusted",   color: 0xF1C40F },  // yellow
  { name: "Good",      color: 0x2ECC71 },  // green
  { name: "Caution",   color: 0xE67E22 },  // orange
  { name: "Untrusted", color: 0x95A5A6 },  // grey
];

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();

  console.log("\n── Creating Tier Roles ──");

  for (const def of TIER_ROLES) {
    const existing = guild.roles.cache.find(r => r.name === def.name);
    if (existing) {
      // Update color if needed
      if (existing.color !== def.color) {
        await existing.edit({ color: def.color });
        console.log(`  ✓ Updated @${def.name} color`);
      } else {
        console.log(`  ⏭ @${def.name} exists`);
      }
    } else {
      await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: true,  // show separately in sidebar
        reason: "Reputation tier role",
      });
      console.log(`  ✓ Created @${def.name}`);
    }
  }

  console.log("\n✅ Tier roles ready!");
  console.log("Roles show in sidebar with colors:");
  console.log("  👑 Legend  — Gold");
  console.log("  💎 Elite   — Blue");
  console.log("  🏆 Veteran — Purple");
  console.log("  ⭐ Trusted — Yellow");
  console.log("  ✅ Good    — Green");
  console.log("  ⚠️ Caution — Orange");
  console.log("  🚫 Untrusted — Grey");

  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
