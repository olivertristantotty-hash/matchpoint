import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_TOKEN!);

  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  await guild.roles.fetch();
  const everyoneRole = guild.roles.everyone;

  // Remove "Change Nickname" from @everyone
  const currentPerms = everyoneRole.permissions;
  const newPerms = currentPerms.remove(PermissionFlagsBits.ChangeNickname);
  await everyoneRole.edit({ permissions: newPerms });

  console.log("✅ Nickname changes disabled for @everyone.");
  await client.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
