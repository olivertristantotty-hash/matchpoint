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
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
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
import {
  startRiotVerification,
  checkRiotVerification,
  clearRiotPending,
  SUPPORTED_REGIONS,
} from "../services/riot-verify.js";
import { identityService } from "../services/identity.js";
import { assignPlatformRole } from "./buttons.js";

const VERIFIED_ROLE_NAME = "Verified";

// Games mapping — role name to pick from, emoji for the menu.
// Role names must match what setup-onboarding.ts created.
const GAME_ROLES: { value: string; roleName: string; label: string; emoji: string; description: string }[] = [
  { value: "valorant",     roleName: "Valorant",      label: "Valorant",          emoji: "🎯", description: "Riot 1v1 customs" },
  { value: "lol",          roleName: "LoL",           label: "League of Legends", emoji: "🗡️", description: "Summoner's Rift 1v1" },
  { value: "cod",          roleName: "Call of Duty",  label: "Call of Duty",      emoji: "🔫", description: "BO6, MW3, Warzone" },
  { value: "fifa",         roleName: "EA FC",         label: "EA FC / FIFA",      emoji: "⚽", description: "Online Friendlies" },
  { value: "fortnite",     roleName: "Fortnite",      label: "Fortnite",          emoji: "🏆", description: "Box Fight / Zone Wars 1v1" },
  { value: "rocketleague", roleName: "Rocket League", label: "Rocket League",     emoji: "🚗", description: "Private match 1v1" },
  { value: "nba2k",        roleName: "NBA 2K",        label: "NBA 2K",            emoji: "🏀", description: "Play Now Online" },
  { value: "madden",       roleName: "Madden",        label: "Madden NFL",        emoji: "🏈", description: "Head to Head" },
  { value: "mariokart",    roleName: "Mario Kart",    label: "Mario Kart",        emoji: "🏁", description: "VS Race" },
];

const PLATFORM_DISPLAY: Record<string, { name: string; usernameHint: string }> = {
  steam:       { name: "Steam",       usernameHint: "Custom URL name (e.g. oliver) or SteamID64" },
  xbox:        { name: "Xbox",        usernameHint: "Your Gamertag" },
  riot:        { name: "Riot",        usernameHint: "Name#TAG (e.g. Faker#KR1)" },
  playstation: { name: "PlayStation", usernameHint: "Your PSN ID" },
  activision:  { name: "Activision",  usernameHint: "Activision ID (e.g. User#1234567)" },
  epic:        { name: "Epic Games",  usernameHint: "Your Epic display name" },
};

const VERIFY_WEB_URL = process.env.VERIFY_WEB_URL ?? "https://matchpoint-rho-ten.vercel.app";

/** vconnect — single Verify button, sends user a personalized OAuth link */
export async function handleVerifyConnect(interaction: ButtonInteraction) {
  const url = `${VERIFY_WEB_URL}/api/verify/start?state=${interaction.user.id}`;

  await interaction.reply({
    content: [
      `**Click the link below to verify:**`,
      ``,
      `🔗 [**Verify your account**](${url})`,
      ``,
      `This opens Discord's authorization page. We'll check if you have a gaming account (Riot, Steam, Xbox, PlayStation, Epic, Battle.net, or League of Legends) connected to your Discord.`,
      ``,
      `If you don't have one connected yet: **Discord Settings → Connections → link any gaming platform**, then come back and click Verify again.`,
    ].join("\n"),
    ephemeral: true,
  });
}

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

  // Riot needs a region too
  if (platform === "riot") {
    const regionInput = new TextInputBuilder()
      .setCustomId("region")
      .setLabel("Region")
      .setPlaceholder("na, euw, eune, kr, jp, br, lan, las, oce")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(4);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(regionInput),
    );
  }

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

  // Riot — real verification via summoner icon challenge
  if (platform === "riot") {
    const region = interaction.fields.getTextInputValue("region").trim();
    const result = await startRiotVerification(user.id, username, region);

    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }

    const checkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("vcheck:riot")
        .setLabel("I've changed my icon — Verify")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
    );

    return interaction.editReply({
      content: [
        `**Verify your Riot account**`,
        ``,
        `Linking as: \`${result.riotId}\``,
        ``,
        `**Change your League of Legends summoner icon to icon ID \`${result.targetIconId}\`:**`,
        `${result.iconUrl}`,
        ``,
        `1. Open League of Legends`,
        `2. Click your profile icon (top-left)`,
        `3. Go to **Collection → Summoner Icons**`,
        `4. Find and equip icon ID **${result.targetIconId}** (shown above)`,
        `5. Click **Verify** below`,
        ``,
        `You can switch back to your old icon after verification. (Expires in 10 minutes.)`,
      ].join("\n"),
      components: [checkRow],
    });
  }

  // PlayStation / Activision — unverified link for now.
  // (Cross-verification policy: these don't grant access to real-money wagers
  //  on their own — see identity.ts preWagerIdentityCheck.)
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
      `Saved on trust — you can link Steam or Xbox later for a verified badge.`,
      ``,
      `**Pick the games you play** to unlock their channels:`,
    ].join("\n"),
    components: [buildGamePickerRow()],
  });
}

/** vcheck:<platform> — user clicks Verify after pasting the code */
export async function handleVerifyCheck(interaction: ButtonInteraction, platform: string) {
  await interaction.deferReply({ ephemeral: true });

  const user = await userService.ensureUser(interaction.user.id, interaction.user.username);

  // Riot uses a different verification flow (icon challenge)
  if (platform === "riot") {
    const result = await checkRiotVerification(user.id);
    if (!result) {
      return interaction.editReply({
        content: "Verification expired or missing. Click **Riot** on #verify to start over.",
      });
    }

    if (!result.matched) {
      return interaction.editReply({
        content: [
          `Icon didn't match. We still see icon \`${result.currentIconId}\` on your account.`,
          ``,
          `You need to equip icon ID **\`${result.targetIconId}\`** in League of Legends.`,
          `Riot can take 30–60 seconds to reflect the change. Wait a moment and click Verify again.`,
        ].join("\n"),
      });
    }

    await db.insert(gameAccounts)
      .values({
        id: nanoid(),
        userId: user.id,
        platform: "riot",
        platformUserId: result.puuid,
        platformUsername: result.riotId,
      })
      .onConflictDoUpdate({
        target: [gameAccounts.userId, gameAccounts.platform],
        set: {
          platformUserId: result.puuid,
          platformUsername: result.riotId,
          linkedAt: new Date(),
        },
      });

    clearRiotPending(user.id);
    await grantVerifiedRole(interaction);
    try { await assignPlatformRole(interaction, "riot"); } catch {}

    return interaction.editReply({
      content: [
        `✅ **Verified!** Riot account **${result.riotId}** linked.`,
        ``,
        `You can switch back to your old icon whenever you want.`,
        ``,
        `**Pick the games you play** to unlock their channels:`,
      ].join("\n"),
      components: [buildGamePickerRow()],
    });
  }

  // Steam / Xbox (code-in-bio)
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
      `You can remove the code from your profile now.`,
      ``,
      `**Pick the games you play** to unlock their channels:`,
    ].join("\n"),
    components: [buildGamePickerRow()],
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

// ── Game picker ──

function buildGamePickerRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("vgame_pick")
    .setPlaceholder("Select games you play…")
    .setMinValues(1)
    .setMaxValues(GAME_ROLES.length)
    .addOptions(
      GAME_ROLES.map((g) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(g.label)
          .setValue(g.value)
          .setDescription(g.description)
          .setEmoji(g.emoji),
      ),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/** vgame_pick — user selected games, grant the matching roles */
export async function handleGamePick(interaction: StringSelectMenuInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) return interaction.editReply({ content: "Run this in the server." });

  await guild.roles.fetch();
  const member = await guild.members.fetch(interaction.user.id);

  const picked: string[] = [];
  const missing: string[] = [];

  for (const value of interaction.values) {
    const def = GAME_ROLES.find((g) => g.value === value);
    if (!def) continue;

    const role = guild.roles.cache.find((r) => r.name === def.roleName);
    if (!role) {
      missing.push(def.label);
      continue;
    }

    if (!member.roles.cache.has(role.id)) {
      try {
        await member.roles.add(role, "Game selection from verify gate");
      } catch (err: any) {
        missing.push(`${def.label} (${err?.message ?? "failed"})`);
        continue;
      }
    }
    picked.push(`${def.emoji} ${def.label}`);
  }

  const lines = [];
  if (picked.length > 0) {
    lines.push(`✅ Added: ${picked.join(", ")}`);
    lines.push(``);
    lines.push(`Those game channels are now visible in your sidebar. Welcome.`);
  }
  if (missing.length > 0) {
    lines.push(``);
    lines.push(`⚠ Couldn't assign: ${missing.join(", ")} — ask an admin.`);
  }

  // Replace the message (remove the menu so it can't be re-picked)
  try {
    await interaction.editReply({
      content: lines.join("\n"),
      components: [],
    });
  } catch {}
}
