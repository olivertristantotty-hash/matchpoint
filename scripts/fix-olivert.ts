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
  const members = await guild.members.fetch();

  const memberRole = guild.roles.cache.find(r => r.name === "Member");
  const competitorRole = guild.roles.cache.find(r => r.name === "Competitor");

  for (const [, m] of members) {
    if (m.user.bot) continue;

    // Give all existing users both roles
    if (memberRole && !m.roles.cache.has(memberRole.id)) await m.roles.add(memberRole);
    if (competitorRole && !m.roles.cache.has(competitorRole.id)) await m.roles.add(competitorRole);

    // Set olivert's nickname
    if (m.user.id === "1444070358096281831") {
      await m.setNickname("👑 olivert");
      console.log("Set nickname: 👑 olivert (Legend, 1500 rep)");
    }

    console.log(`Roles assigned to ${m.user.username}`);
  }

  await client.destroy();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
