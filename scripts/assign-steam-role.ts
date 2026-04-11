import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits } from "discord.js";

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(process.env.DISCORD_TOKEN!);

  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  await guild.roles.fetch();
  const steamRole = guild.roles.cache.find(r => r.name === "Steam Verified");
  if (!steamRole) { console.log("Role not found"); process.exit(1); }

  const members = await guild.members.fetch();
  for (const [, member] of members) {
    if (member.user.bot) continue;
    if (!member.roles.cache.has(steamRole.id)) {
      await member.roles.add(steamRole);
      console.log(`Assigned @Steam Verified to ${member.user.username}`);
    }
  }

  await client.destroy();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
