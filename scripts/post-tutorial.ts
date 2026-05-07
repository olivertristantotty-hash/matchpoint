import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "dotenv";

config();

const token = process.env.DISCORD_TOKEN!;

// ── Replace this with your actual screenshot URL ──
// Upload the FIFA lobby screenshot to Discord (or Imgur) and paste the URL here
const TUTORIAL_IMAGE_URL = "https://i.imgur.com/placeholder.png";

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(token);
  await new Promise<void>((resolve) => client.once("ready", () => resolve()));
  console.log(`Logged in as ${client.user?.tag}`);

  for (const [, guild] of client.guilds.cache) {
    console.log(`Processing guild: ${guild.name}`);

    const channels = await guild.channels.fetch();

    for (const channelName of ["find-match", "free-play"]) {
      const channel = channels.find(c => c?.isTextBased() && c.name === channelName) as TextChannel | undefined;
      if (!channel) {
        console.log(`  #${channelName} not found, skipping`);
        continue;
      }

      const isMP = channelName === "find-match";
      const currency = isMP ? "MP" : "FP";
      const modeLabel = isMP ? "💰 Real Money (MP)" : "🎮 Freeplay (FP)";

      let embed: EmbedBuilder;

      if (isMP) {
        embed = new EmbedBuilder()
          .setTitle(`⚔️ How to Wager on MATCHPOINT`)
          .setColor(0xffd700)
          .addFields(
            { name: "1️⃣ Host", value: `\`/host\` → pick game, platform, amount`, inline: true },
            { name: "2️⃣ Accept", value: `Click **Accept Match** on a lobby`, inline: true },
            { name: "3️⃣ Ready Up", value: `Confirm rules → click **I'm Ready**`, inline: true },
            { name: "4️⃣ Play", value: `Play your match`, inline: true },
            { name: "5️⃣ Report", value: `**Match Over** → screenshot → **Quick Settle**`, inline: true },
            { name: "6️⃣ Collect", value: `Winner gets paid instantly`, inline: true },
            {
              name: "💡 Challenge Someone Directly",
              value: `Right-click a player → **Apps** → **Challenge to Wager** → pick game → set amount`,
            },
            {
              name: "⚠️ Refund Policy",
              value: [
                `Once both players click **"I'm Ready"**, the wager is **official**.`,
                `No refunds for lag, disconnections, crashes, or hardware issues.`,
                ``,
                `**Refunds are only available with evidence of foul play** (cheating, exploits, etc.) — this is the only exception. Open a dispute and a moderator will review.`,
              ].join("\n"),
            },
          )
          .setFooter({ text: "MATCHPOINT" });
      } else {
        embed = new EmbedBuilder()
          .setTitle(`🎮 Free Play — No Risk, All Fun`)
          .setColor(0x9b59b6)
          .setDescription(`Practice, build your reputation, and compete for bragging rights. Use \`/daily\` to claim free FP every 24 hours.`)
          .addFields(
            { name: "1️⃣ Get FP", value: `\`/daily\` → claim 1,000 FP`, inline: true },
            { name: "2️⃣ Host or Accept", value: `\`/host\` or click **Accept Match**`, inline: true },
            { name: "3️⃣ Play & Report", value: `Same flow as real wagers`, inline: true },
            {
              name: "💡 Challenge Someone Directly",
              value: `Right-click a player → **Apps** → **Freeplay Challenge** → pick game → set amount`,
            },
            {
              name: "🎯 Why Play Free?",
              value: [
                `• Build your **reputation** and unlock higher real stakes`,
                `• Practice against opponents before wagering for real`,
                `• Climb the **freeplay leaderboard**`,
                `• No money needed — just skill`,
              ].join("\n"),
            },
          )
          .setFooter({ text: "MATCHPOINT · Freeplay" });
      }

      // Delete any existing pinned tutorial from the bot
      try {
        const pins = await channel.messages.fetchPinned();
        for (const [, pin] of pins) {
          if (pin.author.id === client.user?.id && pin.embeds.length > 0) {
            await pin.delete();
          }
        }
      } catch {}

      // Send and pin the new tutorial
      const msg = await channel.send({ embeds: [embed] });
      await msg.pin();
      console.log(`  ✅ Tutorial posted and pinned in #${channelName}`);

      // Delete the "pinned a message" system message
      try {
        const recent = await channel.messages.fetch({ limit: 5 });
        for (const [, m] of recent) {
          if (m.type === 6 && m.author.id === client.user?.id) {
            await m.delete();
          }
        }
      } catch {}
    }
  }

  console.log("Done!");
  client.destroy();
  process.exit(0);
}

main().catch(console.error);
