import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });

import { Client, GatewayIntentBits, ChannelType, TextChannel } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const SKIP = ["rules", "welcome", "link-accounts"];

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  for (const [, ch] of channels) {
    if (!ch || ch.type !== ChannelType.GuildText || SKIP.includes(ch.name)) continue;

    try {
      const textCh = ch as TextChannel;
      const msgs = await textCh.messages.fetch({ limit: 100 });
      if (msgs.size === 0) continue;

      console.log(`Clearing #${ch.name} (${msgs.size} messages)...`);
      for (const [, msg] of msgs) {
        try { await msg.delete(); } catch {}
      }
      console.log(`  ✓ Done`);
    } catch {}
  }

  console.log("\n✅ All channels cleared!");
  await client.destroy();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
