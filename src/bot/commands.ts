import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import { GAME_CHOICES, LEADERBOARD_GAME_CHOICES } from "./game-choices.js";

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
      .addChoices(...GAME_CHOICES))
    .addIntegerOption(opt => opt.setName("amount").setDescription("MP to wager").setRequired(true).setMinValue(10)),

  new SlashCommandBuilder()
    .setName("accept")
    .setDescription("Accept a wager challenge")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID to accept").setRequired(true)),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report your match result")
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
    .setDescription("Check your balance"),

  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Deposit MP — opens the wallet page"),

  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw MP — opens the wallet page"),

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription("Check your or another player's reputation")
    .addUserOption(opt => opt.setName("user").setDescription("User to check (leave empty for yourself)")),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the top players")
    .addStringOption(opt => opt.setName("category").setDescription("Ranking metric")
      .addChoices(
        { name: "Wins", value: "wins" },
        { name: "Earnings", value: "earnings" },
        { name: "Win Rate", value: "win_rate" },
        { name: "Streak", value: "streak" },
        { name: "Reputation", value: "reputation" },
      ))
    .addStringOption(opt => opt.setName("period").setDescription("Time period")
      .addChoices(
        { name: "Weekly", value: "weekly" },
        { name: "Monthly", value: "monthly" },
        { name: "Seasonal", value: "seasonal" },
        { name: "All Time", value: "all-time" },
      ))
    .addStringOption(opt => opt.setName("game").setDescription("Filter by game")
      .addChoices(...LEADERBOARD_GAME_CHOICES))
    .addStringOption(opt => opt.setName("mode").setDescription("Wager mode")
      .addChoices(
        { name: "💰 MP (Real)", value: "real" },
        { name: "🎮 FP (Freeplay)", value: "freeplay" },
      )),

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
        { name: "Medal.tv", value: "medal" },
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
    .setDescription("Claim your daily FP (1,000 FP every 24 hours)"),

  new SlashCommandBuilder()
    .setName("freeplay")
    .setDescription("Challenge someone to a freeplay wager (no real money)")
    .addUserOption(opt => opt.setName("opponent").setDescription("Who to challenge").setRequired(true))
    .addStringOption(opt => opt.setName("game").setDescription("Game to play").setRequired(true)
      .addChoices(...GAME_CHOICES))
    .addIntegerOption(opt => opt.setName("amount").setDescription("FP to wager").setRequired(true).setMinValue(10)),

  // ── Host Wager Lobby ──

  new SlashCommandBuilder()
    .setName("host")
    .setDescription("Host an open wager lobby")
    .addStringOption(opt => opt.setName("game").setDescription("Game (auto-detected from channel)")
      .addChoices(...GAME_CHOICES))
    .addStringOption(opt => opt.setName("platform").setDescription("Platform").setRequired(true)
      .addChoices(
        { name: "PC", value: "pc" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "playstation" },
        { name: "Cross-Platform", value: "crossplay" },
      ))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Amount to wager").setRequired(true).setMinValue(10))
    .addStringOption(opt => opt.setName("game_mode").setDescription("Game mode").setRequired(true)
      .addChoices(
        { name: "1v1", value: "1v1" },
        { name: "2v2", value: "2v2" },
        { name: "3v3", value: "3v3" },
        { name: "5v5", value: "5v5" },
        { name: "Battle Royale", value: "br" },
        { name: "Free-for-All", value: "ffa" },
      ))
    .addStringOption(opt => opt.setName("team_size").setDescription("Team size").setRequired(true)
      .addChoices(
        { name: "Solo", value: "solo" },
        { name: "Duo", value: "duo" },
        { name: "Trio", value: "trio" },
        { name: "Squad (4)", value: "squad" },
      ))
    .addStringOption(opt => opt.setName("rounds_format").setDescription("Rounds format").setRequired(true)
      .addChoices(
        { name: "Best of 1", value: "Bo1" },
        { name: "Best of 3", value: "Bo3" },
        { name: "Best of 5", value: "Bo5" },
        { name: "First to 5", value: "Ft5" },
        { name: "First to 10", value: "Ft10" },
      ))
    .addStringOption(opt => opt.setName("rules_notes").setDescription("Custom rules or notes")),

  // ── Lookup ──

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Look up a wager by ID")
    .addStringOption(opt => opt.setName("wager_id").setDescription("Wager ID to look up").setRequired(true)),
];