import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";

export const commands = [
  // ── Context Menu (right-click) ──

  new ContextMenuCommandBuilder()
    .setName("Challenge to Wager")
    .setType(ApplicationCommandType.User),

  new ContextMenuCommandBuilder()
    .setName("Freeplay Challenge")
    .setType(ApplicationCommandType.User),

  new ContextMenuCommandBuilder()
    .setName("View Reputation")
    .setType(ApplicationCommandType.User),

  // ── Slash Commands ──

  new SlashCommandBuilder()
    .setName("wager")
    .setDescription("Challenge someone to a wager")
    .addUserOption(opt => opt.setName("opponent").setDescription("Who to challenge").setRequired(true))
    .addStringOption(opt => opt.setName("game").setDescription("Game to play").setRequired(true)
      .addChoices(
        { name: "FIFA / EA FC", value: "fifa" },
        { name: "League of Legends", value: "lol" },
        { name: "Valorant", value: "valorant" },
        { name: "Rocket League", value: "rocketleague" },
        { name: "Call of Duty", value: "cod" },
        { name: "Fortnite", value: "fortnite" },
        { name: "Other", value: "other" },
      ))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Tokens to wager").setRequired(true).setMinValue(10)),

  new SlashCommandBuilder()
    .setName("accept")
    .setDescription("Accept a wager challenge")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID to accept").setRequired(true)),

  new SlashCommandBuilder()
    .setName("submit")
    .setDescription("Submit your match result screenshot")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID").setRequired(true))
    .addAttachmentOption(opt => opt.setName("screenshot").setDescription("Screenshot of the final score screen").setRequired(true)),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Manually report your match result (fallback if screenshot fails)")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID").setRequired(true))
    .addStringOption(opt => opt.setName("result").setDescription("Did you win or lose?").setRequired(true)
      .addChoices(
        { name: "I won", value: "win" },
        { name: "I lost", value: "loss" },
      )),

  new SlashCommandBuilder()
    .setName("cancel")
    .setDescription("Cancel a pending wager you created")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID to cancel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your token balance"),

  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Get free starter tokens (demo)")
    .addIntegerOption(opt => opt.setName("amount").setDescription("Amount of tokens").setRequired(true).setMinValue(1).setMaxValue(10000)),

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription("Check your or another player's reputation")
    .addUserOption(opt => opt.setName("user").setDescription("User to check (leave empty for yourself)")),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the top players by winnings"),

  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link a game platform account")
    .addStringOption(opt => opt.setName("platform").setDescription("Game platform").setRequired(true)
      .addChoices(
        { name: "Riot (LoL / Valorant)", value: "riot" },
        { name: "EA (FIFA / EA FC)", value: "ea" },
        { name: "Steam", value: "steam" },
        { name: "Epic Games", value: "epic" },
        { name: "Activision", value: "activision" },
      ))
    .addStringOption(opt => opt.setName("username").setDescription("Your username/ID on that platform").setRequired(true)),

  new SlashCommandBuilder()
    .setName("resolve")
    .setDescription("Resolve a dispute (moderators only)")
    .addStringOption(opt => opt.setName("dispute_id").setDescription("Dispute ID").setRequired(true))
    .addStringOption(opt => opt.setName("outcome").setDescription("Resolution").setRequired(true)
      .addChoices(
        { name: "Creator wins", value: "creator_wins" },
        { name: "Opponent wins", value: "opponent_wins" },
        { name: "Refund both", value: "refund" },
      )),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("View your recent wager history"),

  // ── Freeplay ──

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily free coins (1,000 coins every 24 hours)"),

  new SlashCommandBuilder()
    .setName("freeplay")
    .setDescription("Challenge someone to a freeplay wager (no real money)")
    .addUserOption(opt => opt.setName("opponent").setDescription("Who to challenge").setRequired(true))
    .addStringOption(opt => opt.setName("game").setDescription("Game to play").setRequired(true)
      .addChoices(
        { name: "FIFA / EA FC", value: "fifa" },
        { name: "League of Legends", value: "lol" },
        { name: "Valorant", value: "valorant" },
        { name: "Rocket League", value: "rocketleague" },
        { name: "Call of Duty", value: "cod" },
        { name: "Fortnite", value: "fortnite" },
        { name: "Other", value: "other" },
      ))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Free coins to wager").setRequired(true).setMinValue(10)),
];
