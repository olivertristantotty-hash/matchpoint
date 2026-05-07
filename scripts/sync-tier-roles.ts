import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits } from "discord.js";
import postgres from "postgres";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const DATABASE_URL = process.env.DATABASE_URL!;

const ALL_TIERS = ["Legend", "Elite", "Veteran", "Trusted", "Good", "Caution", "Untrusted"];

function getTier(rep: number): string {
  if (rep >= 1000) return "Legend";
  if (rep >= 500) return "Elite";
  if (rep >= 300) return "Veteran";
  if (rep >= 150) return "Trusted";
  if (rep >= 100) return "Good";
  if (rep >= 50) return "Caution";
  return "Untrusted";
}

async function main() {
  const sql = postgres(DATABASE_URL, { ssl: "require" });
  const users = await sql`SELECT discord_id, username, reputation FROM users`;

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.members.fetch();

  for (const user of users) {
    const tier = getTier(user.reputation);
    const member = guild.members.cache.find(m => m.user.id === user.discord_id);
    if (!member) continue;

    // Assign correct tier role, remove others
    for (const tierName of ALL_TIERS) {
      const role = guild.roles.cache.find(r => r.name === tierName);
      if (!role) continue;

      if (tierName === tier) {
        if (!member.roles.cache.has(role.id)) await member.roles.add(role);
      } else {
        if (member.roles.cache.has(role.id)) await member.roles.remove(role);
      }
    }

    console.log(`${user.username}: ${user.reputation} rep → @${tier}`);
  }

  await sql.end();
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
