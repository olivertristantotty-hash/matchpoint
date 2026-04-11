import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { userService } from "../services/user.js";
import { walletService } from "../services/wallet.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const DAILY_AMOUNT = 1000;

/** Build the onboarding message sent via DM to new members */
export function buildOnboardingMessage() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("onboard_claim")
      .setLabel("🎁 Claim Free Coins")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("onboard_link")
      .setLabel("🔗 Link Game Account")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("onboard_how")
      .setLabel("❓ How It Works")
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    content: [
      `**Welcome to MATCHPOINT!** ⚔️`,
      ``,
      `Challenge anyone to a match. Winner takes the pot.`,
      ``,
      `**Start here:**`,
    ].join("\n"),
    components: [row1],
  };
}

/** Handle onboarding button clicks */
export async function handleOnboardingButton(interaction: ButtonInteraction) {
  const action = interaction.customId;

  try {
    switch (action) {
      case "onboard_claim":
        return await handleOnboardClaim(interaction);
      case "onboard_link":
        return await handleOnboardLink(interaction);
      case "onboard_how":
        return await handleOnboardHow(interaction);
    }
  } catch (err: any) {
    console.error("[Onboarding] Error:", err.message);
    try {
      await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    } catch {}
  }
}

async function handleOnboardClaim(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Check cooldown
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
  if (dbUser.lastDailyClaim) {
    const timeSince = Date.now() - dbUser.lastDailyClaim.getTime();
    if (timeSince < 24 * 60 * 60 * 1000) {
      const nextClaim = new Date(dbUser.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000);
      return interaction.editReply({
        content: `Already claimed today! Next claim: <t:${Math.floor(nextClaim.getTime() / 1000)}:R>\n\nUse \`/freeplay @someone game amount\` to challenge someone, or right-click their name → Apps → **Freeplay Challenge**.`,
      });
    }
  }

  await walletService.addFreeplayCoins(user.id, DAILY_AMOUNT);
  await db.update(users).set({ lastDailyClaim: new Date() }).where(eq(users.id, user.id));

  const balance = await walletService.getBalance(user.id);
  await interaction.editReply({
    content: [
      `🎁 **+${DAILY_AMOUNT} free coins!** Balance: **${balance.freeplay}** coins`,
      ``,
      `Now challenge someone:`,
      `• Right-click a player's name → Apps → **Freeplay Challenge**`,
      `• Or type \`/freeplay @someone game amount\``,
      `• Or head to **#free-play** and find an opponent`,
    ].join("\n"),
  });
}

async function handleOnboardLink(interaction: ButtonInteraction) {
  await interaction.reply({
    content: [
      `**Link your game accounts** to unlock real-money wagers and verified status.`,
      ``,
      `Type one of these in any channel:`,
      `\`/link platform:Steam username:YourSteamID\` — verified ✅`,
      `\`/link platform:Xbox username:YourGamertag\` — verified ✅`,
      `\`/link platform:Riot username:Name#TAG\``,
      `\`/link platform:EA username:YourEAID\``,
      `\`/link platform:Epic username:YourEpicName\``,
      `\`/link platform:Activision username:YourActiID\``,
      ``,
      `Steam and Xbox are verified — you prove you own the account. Others are saved on trust.`,
    ].join("\n"),
    ephemeral: true,
  });
}

async function handleOnboardHow(interaction: ButtonInteraction) {
  await interaction.reply({
    content: [
      `**How MATCHPOINT works:**`,
      ``,
      `1️⃣ **Challenge** — right-click someone → Apps → Challenge, or use \`/wager\` or \`/freeplay\``,
      `2️⃣ **Accept** — opponent clicks the Accept button`,
      `3️⃣ **Play** — go play your match`,
      `4️⃣ **Report** — both players click "I Won" or "I Lost" in the wager thread`,
      `5️⃣ **Collect** — if you both agree, winner gets paid instantly`,
      ``,
      `**Two modes:**`,
      `🎮 **Free Play** — use free coins from \`/daily\`. No risk, just bragging rights.`,
      `💰 **Real Wagers** — use real tokens. Requires a linked game account.`,
      ``,
      `**If there's a dispute:**`,
      `Both claim they won → post evidence in the thread → mod decides. Fake results = instant permaban.`,
    ].join("\n"),
    ephemeral: true,
  });
}
