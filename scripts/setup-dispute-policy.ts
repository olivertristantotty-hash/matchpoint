import { Client, GatewayIntentBits, ChannelType, TextChannel, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "dotenv";

config();

const token = process.env.DISCORD_TOKEN!;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(token);
  await new Promise<void>((resolve) => client.once("ready", () => resolve()));
  console.log(`Logged in as ${client.user?.tag}`);

  for (const [, guild] of client.guilds.cache) {
    console.log(`Processing guild: ${guild.name}`);

    const channels = await guild.channels.fetch();

    // Find the INFO category (where setup-guide lives)
    const infoCategory = channels.find(
      c => c?.type === ChannelType.GuildCategory && c.name.toLowerCase().includes("info")
    );

    // Check if channel already exists
    const existing = channels.find(
      c => c?.type === ChannelType.GuildText && (c as TextChannel).name === "dispute-policy"
    );

    let channel: TextChannel;

    if (existing) {
      channel = existing as TextChannel;
      console.log(`  #dispute-policy already exists`);
      // Clear old messages from bot
      const msgs = await channel.messages.fetch({ limit: 10 });
      for (const [, m] of msgs) {
        if (m.author.id === client.user?.id) {
          try { await m.delete(); } catch {}
        }
      }
    } else {
      // Create the channel under INFO category
      channel = await guild.channels.create({
        name: "dispute-policy",
        type: ChannelType.GuildText,
        parent: infoCategory?.id ?? null,
        topic: "How disputes work, fairness policy, and your rights as a player.",
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.UseApplicationCommands],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });
      console.log(`  ✅ Created #dispute-policy`);
    }

    // Post the dispute policy
    const embed1 = new EmbedBuilder()
      .setTitle("⚖️ Dispute & Fairness Policy")
      .setColor(0x3498db)
      .setDescription([
        `MATCHPOINT uses the same dispute resolution model trusted by major competitive platforms like **Players' Lounge**, **GamerSaloon**, and **Checkmate Gaming**. Here's how it works.`,
      ].join("\n"))
      .addFields(
        {
          name: "🔄 How Results Work",
          value: [
            `After every match, both players report the outcome independently.`,
            `• **Both agree** → winner gets paid instantly`,
            `• **Both claim they won** → dispute opens automatically`,
            `• **One player doesn't respond** → the reporter's result stands after 15 minutes`,
            `• **Neither reports** → match is voided and both are refunded`,
          ].join("\n"),
        },
        {
          name: "⚠️ What Happens in a Dispute",
          value: [
            `1. The match thread stays open for evidence`,
            `2. Both players should post their **screenshot or clip** of the final score`,
            `3. A moderator reviews the evidence and decides the outcome`,
            `4. The losing player in a dispute receives a **reputation penalty**`,
            `5. **Deliberately lying about a result = instant permanent ban**`,
          ].join("\n"),
        },
      );

    const embed2 = new EmbedBuilder()
      .setColor(0x3498db)
      .addFields(
        {
          name: "📸 Evidence Requirements",
          value: [
            `• Screenshot of the **final score screen** clearly showing both players`,
            `• Medal.tv or other clip showing the match result`,
            `• Evidence must be from the **same match** (timestamps are checked)`,
            `• No evidence = your claim is weaker in a dispute`,
          ].join("\n"),
        },
        {
          name: "🛡️ Fairness Guarantees",
          value: [
            `• **Blind reporting** — neither player sees the other's report until both submit`,
            `• **Reputation system** — repeat offenders are banned, honest players are rewarded`,
            `• **Zero tolerance for cheating** — fake results, exploits, or manipulation = permaban`,
            `• **Moderator neutrality** — mods decide based on evidence only, not who they know`,
            `• **Escrow protection** — funds are locked until the match is settled, nobody can run`,
          ].join("\n"),
        },
        {
          name: "🏢 Industry Standard",
          value: [
            `This model is the same one used across the competitive gaming industry:`,
            `• **Players' Lounge** — self-reported results with dispute escalation`,
            `• **GamerSaloon** — screenshot-based verification with mod review`,
            `• **Checkmate Gaming** — blind reporting with evidence-based disputes`,
            `• **Wager Matches (CMG)** — reputation + escrow + mod arbitration`,
            ``,
            `We follow the same proven approach because it works. Fair play is enforced, cheaters are removed, and honest players are protected.`,
          ].join("\n"),
        },
        {
          name: "💡 Tips to Protect Yourself",
          value: [
            `• **Always screenshot the final score** — even if you think there won't be a dispute`,
            `• **Use Medal.tv** for automatic clip capture (\`/link platform:Medal.tv\`)`,
            `• **Don't accept wagers from low-rep players** if you're not comfortable`,
            `• **Report honestly** — your reputation is your most valuable asset here`,
          ].join("\n"),
        },
      )
      .setFooter({ text: "MATCHPOINT · Fair play, always." });

    await channel.send({ embeds: [embed1] });
    await channel.send({ embeds: [embed2] });
    console.log(`  ✅ Dispute policy posted in #dispute-policy`);
  }

  console.log("Done!");
  client.destroy();
  process.exit(0);
}

main().catch(console.error);
