import { Client, TextChannel, EmbedBuilder } from "discord.js";

let botClient: Client | null = null;

export function setBotClient(client: Client) {
  botClient = client;
}

export function getBotClient(): Client | null {
  return botClient;
}

/** Send a DM to a Discord user */
export async function sendDM(discordId: string, content: string) {
  if (!botClient) return;
  try {
    const user = await botClient.users.fetch(discordId);
    await user.send(content);
  } catch (err) {
    console.error(`[Notifications] Failed to DM ${discordId}:`, err);
  }
}

/** Post to a specific channel in a guild */
export async function postToChannel(guildId: string, channelId: string, content: string) {
  if (!botClient) return;
  try {
    const channel = await botClient.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await (channel as TextChannel).send(content);
    }
  } catch (err) {
    console.error(`[Notifications] Failed to post to channel ${channelId}:`, err);
  }
}

/**
 * Post to a named channel in a guild (e.g. "active-wagers", "results").
 * Searches for the channel by name — returns silently if not found.
 */
export async function postToNamedChannel(guildId: string, channelName: string, content: string) {
  if (!botClient) return;
  try {
    const guild = await botClient.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const target = channels.find(
      c => c?.isTextBased() && c.name === channelName
    );
    if (target?.isTextBased()) {
      await (target as TextChannel).send(content);
    }
  } catch (err) {
    // Channel doesn't exist — that's fine, not every server will have it
  }
}

/** Send a welcome DM to a new server member */
export async function sendWelcomeDM(discordId: string) {
  await sendDM(discordId, [
    `**Welcome to WagerBot!** 🎮`,
    ``,
    `Here's how to get started:`,
    `→ \`/deposit 1000\` — grab free starter tokens`,
    `→ \`/wager @opponent game amount\` — challenge someone`,
    `→ \`/link\` — connect your game accounts for auto-verified results`,
    ``,
    `Good luck out there.`,
  ].join("\n"));
}

/** Announce a new wager in the #active-wagers channel */
export async function announceWager(
  guildId: string,
  creatorName: string,
  opponentName: string,
  game: string,
  amount: number,
  wagerId: string,
) {
  await postToNamedChannel(guildId, "active-wagers", [
    `⚔️ **New Wager**`,
    `**${creatorName}** vs **${opponentName}**`,
    `Game: **${game.toUpperCase()}** · Stake: **${amount}** tokens each`,
    `ID: \`${wagerId}\``,
  ].join("\n"));
}

/** Announce a settled wager in the #results channel */
export async function announceResult(
  guildId: string,
  winnerDiscordId: string,
  loserName: string,
  game: string,
  winnings: number,
  score?: string,
) {
  await postToNamedChannel(guildId, "results", [
    `🏆 **Match Result**`,
    `<@${winnerDiscordId}> defeated **${loserName}** in **${game.toUpperCase()}**`,
    score ? `Score: ${score}` : "",
    `Winnings: **${winnings}** tokens`,
  ].filter(Boolean).join("\n"));
}

/** Announce a dispute in the #disputes channel */
export async function announceDispute(
  guildId: string,
  wagerId: string,
  disputeId: string,
  reason: string,
) {
  await postToNamedChannel(guildId, "disputes", [
    `⚠️ **Dispute Opened**`,
    `Wager: \`${wagerId}\``,
    `Reason: ${reason}`,
    `Moderators: use \`/resolve dispute_id:${disputeId} outcome:<choice>\` to resolve.`,
  ].join("\n"));
}
