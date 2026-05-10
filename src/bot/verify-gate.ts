/**
 * Verify-gate flow: the buttons on the #verify channel embed.
 *
 * Button customIds:
 *   vstart:<platform>  — opens a modal asking for the username
 *   vcheck:<platform>  — user clicks after pasting the code in their profile
 *
 * Modal customId:
 *   vsubmit:<platform> — submitted after they type their username
 *
 * On successful verification, we:
 *   - insert/update a row in gameAccounts
 *   - grant the @Verified role
 *   - grant the platform-specific role (e.g. @Steam Verified)
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { gameAccounts } from "../db/schema.js";
import { userService } from "../services/user.js";
import {
  createVerificationCode,
  getPendingVerification,
  clearPendingVerification,
  verifySteamProfile,
  verifyXboxProfile,
  supportsVerification,
} from "../services/account-verify.js";
import { identityService } from "../services/identity.js";
import { assignPlatformRole } from "./buttons.js";

const VERIFIED_ROLE_NAME = "Verified";

const PLATFORM_DISPLAY: Record<string, { name: string; usernameHint: string }> = {
  steam:       { name: "Steam",       usernameHint: "Custom URL name (e.g. oliver) or SteamID64" },
  xbox:        { name: "Xbox",        usernameHint: "Your Gamertag" },
  riot:        { name: "Riot",        usernameHint: "Name#TAG (e.g. Faker#KR1)" },
  playstation: { name: "PlayStation", usernameHint: "Your PSN ID" },
  activision:  { name: "Activision",  usernameHint: "Activision ID (e.g. User#1234567)" },
  epic:        { name: "Epic Games",  usernameHint: "Your Epic display name" },
};

/** vstart:<platform> — opens the modal */
export async function handleVerifyStart(interaction: ButtonInteraction, platform: string) {
  const meta = PLATFORM_DISPLAY[platform];
  if (!meta) {
    await interaction.reply({ content: "Unknown platform.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`vsubmit:${platform}`)
    .setTitle(`Link your ${meta.name} account`);

  const usernameInput = new TextInputBuilder()
    .setCustomId("username")
    .setLabel(`Your ${meta.name} username`)
    .setPlaceholder(meta.usernameHint)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
  );

  await interaction.showModal(modal);
}

/** vsubmit:<platform> — modal submitted with a username */
export async function handleVerifySubmit(interaction: ModalSubmitInteraction, platform: string) {
  await interaction.deferReply({ ephemeral: true });

  const meta = PLATFORM_DISPLAY[platform];
  if (!meta) return interaction.editReply({ content: "Unknown platform." });

  const username = interaction.fields.getTextInputValue("username").trim();
  if (!username) return interaction.editReply({ content: "Username is required." });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Block if this platform account is tied to a banned user
  const isBanned = await identityService.isGameAccountBanned(platform, username);
  if (isBanned) {
    return interaction.editReply({
      content: "This account is linked to a banned user and cannot be used.",
    });
  }

  // Steam / Xbox have real code-in-bio verification
  if (supportsVerification(platform)) {
    const code = createVerificationCode(user.id, platform, username);
    const instructions = buildInstructions(platform, username, code);

    const checkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vcheck:${platform}`)
        .setLabel("I've added the code — Verify")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
    );

    return interaction.editReply({
      content: instructions,
      components: [checkRow],
    });
  }

  // Riot / PlayStation / Activision — unverified link
  // (Acceptable for now; they can still play and we mark them as unverified
  //  in the DB. Real-money wagers can require a verified link later.)
  await db.insert(gameAccounts)
    .values({
      id: nanoid(),
      userId: user.id,
      platform,
      platformUserId: username,
      platformUsername: username,
    })
    .onConflictDoUpdate({
      target: [gameAccounts.userId, gameAccounts.platform],
      set: { platformUserId: username, platformUsername: username, linkedAt: new Date() },
    });

  await grantVerifiedRole(interaction);
  try { await assignPlatformRole(interaction as any, platform); } catch {}

  await interaction.editReply({
    content: [
      `✅ Linked **${meta.name}**: \`${username}\``,
      ``,
      `This is saved but not cryptographically verified. You can link Steam or Xbox for a verified badge.`,
      ``,
      `The server is now unlocked — welcome.`,
    ].join("\n"),
  });
}

/** vcheck:<platform> — user clicks Verify after pasting the code */
export async function handleVerifyCheck(interaction: ButtonInteraction, platform: string) {
  await interaction.deferReply({ ephemeral: true });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);
  const pending = getPendingVerification(user.id, platform);

  if (!pending) {
    return interaction.editReply({
      content: "Verification code expired or missing. Click the platform button on #verify to start over.",
    });
  }

  let found = false;
  if (platform === "steam") {
    found = await verifySteamProfile(pending.platformUsername, pending.code);
  } else if (platform === "xbox") {
    found = await verifyXboxProfile(pending.platformUsername, pending.code);
  }

  if (!found) {
    return interaction.editReply({
      content: [
        `Code \`${pending.code}\` not found on your ${platform} profile.`,
        ``,
        `Double-check:`,
        `• The code is saved in your ${platform === "steam" ? "Steam profile summary" : "Xbox bio"}`,
        `• Your profile is set to **Public**`,
        `• You saved after adding the code`,
        ``,
        `Try again once you've fixed it.`,
      ].join("\n"),
    });
  }

  await db.insert(gameAccounts)
    .values({
      id: nanoid(),
      userId: user.id,
      platform,
      platformUserId: pending.platformUsername,
      platformUsername: pending.platformUsername,
    })
    .onConflictDoUpdate({
      target: [gameAccounts.userId, gameAccounts.platform],
      set: {
        platformUserId: pending.platformUsername,
        platformUsername: pending.platformUsername,
        linkedAt: new Date(),
      },
    });

  clearPendingVerification(user.id, platform);
  await grantVerifiedRole(interaction);
  try { await assignPlatformRole(interaction, platform); } catch {}

  await interaction.editReply({
    content: [
      `✅ **Verified!** ${platform === "steam" ? "Steam" : "Xbox"} account **${pending.platformUsername}** linked.`,
      ``,
      `You can remove the code from your profile now. The server is unlocked — welcome.`,
    ].join("\n"),
  });
}

// ── helpers ──

function buildInstructions(platform: string, username: string, code: string): string {
  if (platform === "steam") {
    return [
      `**Verify your Steam account**`,
      ``,
      `1. Open your [Steam profile](https://steamcommunity.com/my/profile) → **Edit Profile**`,
      `2. Paste this code anywhere in the **Summary** box:`,
      `   \`\`\`${code}\`\`\``,
      `3. Save. Make sure your profile is set to **Public**.`,
      `4. Click **Verify** below.`,
      ``,
      `Linking as: \`${username}\` (expires in 10 minutes)`,
    ].join("\n");
  }
  if (platform === "xbox") {
    return [
      `**Verify your Xbox account**`,
      ``,
      `1. Open the Xbox app or xbox.com → **Profile** → **Customize** → **Bio**`,
      `2. Paste this code anywhere in your bio:`,
      `   \`\`\`${code}\`\`\``,
      `3. Save.`,
      `4. Click **Verify** below.`,
      ``,
      `Linking as: \`${username}\` (expires in 10 minutes)`,
    ].join("\n");
  }
  return `Verify method not implemented for ${platform}.`;
}

async function grantVerifiedRole(interaction: ButtonInteraction | ModalSubmitInteraction) {
  try {
    const guild = interaction.guild;
    if (!guild) return;
    await guild.roles.fetch();
    const role = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
    if (!role) return;
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, "Passed verify gate");
    }
  } catch (err: any) {
    console.error("[VerifyGate] grantVerifiedRole error:", err?.message);
  }
}
