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
      .setLabel("🎁 Claim Free FP")
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
      `🎁 **+${DAILY_AMOUNT} FP!** Balance: **${balance.freeplay}** FP`,
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
      `🎮 **Free Play** — use free FP from \`/daily\`. No risk, just bragging rights.`,
      `💰 **Real Wagers** — use real MP. Requires a linked game account.`,
      ``,
      `**If there's a dispute:**`,
      `Both claim they won → post evidence in the thread → mod decides. Fake results = instant permaban.`,
    ].join("\n"),
    ephemeral: true,
  });
}

// ── Setup Step Buttons (from #how-it-works) ──

export async function handleSetupButton(interaction: ButtonInteraction) {
  const action = interaction.customId;

  try {
    await interaction.deferReply({ ephemeral: true });

    switch (action) {
      case "setup_link_steam":
        return await interaction.editReply({
          content: [
            `**Link your Steam account:**`,
            `Type this command in any channel:`,
            `\`/link platform:Steam username:YOUR_STEAM_ID\``,
            ``,
            `Your Steam ID is from your profile URL:`,
            `\`steamcommunity.com/id/yourname\` → use \`yourname\``,
            `\`steamcommunity.com/profiles/76561198...\` → use the number`,
            ``,
            `The bot will give you a code to put in your Steam profile summary. After you add it, click Verify.`,
            `Make sure your Steam profile is set to **Public**.`,
          ].join("\n"),
        });

      case "setup_link_xbox":
        return await interaction.editReply({
          content: [
            `**Link your Xbox account:**`,
            `Type this command in any channel:`,
            `\`/link platform:Xbox username:YOUR_GAMERTAG\``,
            ``,
            `The bot will give you a code to put in your Xbox bio. After you add it, click Verify.`,
          ].join("\n"),
        });

      case "setup_link_riot":
        return await interaction.editReply({
          content: [
            `**Link your Riot account (LoL / Valorant):**`,
            `\`/link platform:Riot username:YourName#TAG\``,
            ``,
            `This is saved but not verified. Riot OAuth coming soon.`,
          ].join("\n"),
        });

      case "setup_link_ea":
        return await interaction.editReply({
          content: [
            `**Link your EA account (FIFA / EA FC):**`,
            `\`/link platform:EA username:YourEAID\``,
            ``,
            `This is saved but not verified. EA doesn't offer third-party verification.`,
          ].join("\n"),
        });

      case "setup_link_medal":
        return await interaction.editReply({
          content: [
            `**Link your Medal.tv account:**`,
            `\`/link platform:Medal.tv username:YOUR_MEDAL_USER_ID\``,
            ``,
            `To find your Medal user ID:`,
            `1. Go to medal.tv and log in`,
            `2. Click your profile`,
            `3. Look at the URL — it'll be like \`medal.tv/users/12345\``,
            `4. The number is your user ID`,
            ``,
            `Once linked, the bot will automatically find your clips after matches.`,
          ].join("\n"),
        });

      default:
        await interaction.editReply({ content: "Unknown setup step." });
    }
  } catch (err: any) {
    console.error("[Setup] Error:", err.message);
    try { await interaction.editReply({ content: `Error: ${err.message}` }); } catch {}
  }
}
