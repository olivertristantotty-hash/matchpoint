# Requirements Document

## Introduction

The MATCHPOINT Discord wager bot currently has a minimal `/leaderboard` command that queries all settled wagers, counts wins/losses per user, and displays a plain text list of the top 10 players sorted by win count. This feature replaces that basic implementation with a comprehensive, multi-dimensional leaderboard system that gives players meaningful competitive context — multiple ranking categories, time-based and game-based filtering, separate real money and freeplay boards, streak tracking, seasonal resets, and a persistent auto-updating embed in a dedicated Discord channel.

## Glossary

- **Leaderboard_Service**: The backend service module responsible for computing rankings, aggregating player statistics, and returning sorted leaderboard data.
- **Leaderboard_Command**: The `/leaderboard` slash command handler that accepts filter options and responds with a formatted Discord embed.
- **Leaderboard_Embed**: A persistent Discord embed message posted in the `#leaderboard` channel that auto-refreshes on a scheduled interval.
- **Player_Stats**: A computed data object containing a single player's aggregated statistics (wins, losses, win rate, earnings, current streak, best streak, reputation) scoped to the active filters.
- **Ranking_Category**: A specific metric by which players are sorted — one of: wins, earnings, win_rate, streak, or reputation.
- **Time_Window**: A filter that restricts leaderboard data to a specific period — one of: all-time, seasonal, monthly, or weekly.
- **Season**: A fixed-length competitive period (default 30 days) after which seasonal leaderboard rankings reset and final standings are archived.
- **Win_Streak**: The number of consecutive settled wagers a player has won without an intervening loss, scoped to the active mode and game filters.
- **Best_Streak**: The longest Win_Streak a player has achieved within the active Time_Window.
- **Earnings**: The net token profit a player has accumulated from settled wagers (total winnings minus total losses), scoped to the active filters.
- **Supported_Games**: The set of games available on the platform: fifa, lol, valorant, rocketleague, cod, fortnite, other.
- **Mode**: The wager type — either "real" (real money tokens) or "freeplay" (free virtual coins).

## Requirements

### Requirement 1: Multi-Category Ranking

**User Story:** As a player, I want to view leaderboards ranked by different metrics, so that I can see who excels in different aspects of competition.

#### Acceptance Criteria

1. WHEN a user invokes the Leaderboard_Command with a Ranking_Category of "wins", THE Leaderboard_Service SHALL return players sorted by total settled wager wins in descending order.
2. WHEN a user invokes the Leaderboard_Command with a Ranking_Category of "earnings", THE Leaderboard_Service SHALL return players sorted by net Earnings in descending order.
3. WHEN a user invokes the Leaderboard_Command with a Ranking_Category of "win_rate", THE Leaderboard_Service SHALL return players sorted by win percentage in descending order, excluding players with fewer than 5 settled wagers in the active scope.
4. WHEN a user invokes the Leaderboard_Command with a Ranking_Category of "streak", THE Leaderboard_Service SHALL return players sorted by current Win_Streak in descending order.
5. WHEN a user invokes the Leaderboard_Command with a Ranking_Category of "reputation", THE Leaderboard_Service SHALL return players sorted by reputation score in descending order.
6. WHEN no Ranking_Category is specified, THE Leaderboard_Command SHALL default to the "wins" category.

### Requirement 2: Time-Based Filtering

**User Story:** As a player, I want to filter leaderboards by time period, so that I can see who is performing well recently versus historically.

#### Acceptance Criteria

1. WHEN a user invokes the Leaderboard_Command with a Time_Window of "weekly", THE Leaderboard_Service SHALL include only wagers settled within the last 7 calendar days.
2. WHEN a user invokes the Leaderboard_Command with a Time_Window of "monthly", THE Leaderboard_Service SHALL include only wagers settled within the last 30 calendar days.
3. WHEN a user invokes the Leaderboard_Command with a Time_Window of "seasonal", THE Leaderboard_Service SHALL include only wagers settled within the current Season.
4. WHEN a user invokes the Leaderboard_Command with a Time_Window of "all-time", THE Leaderboard_Service SHALL include all settled wagers regardless of date.
5. WHEN no Time_Window is specified, THE Leaderboard_Command SHALL default to the "seasonal" time window.

### Requirement 3: Game-Based Filtering

**User Story:** As a player, I want to filter the leaderboard by specific games, so that I can see rankings for the games I play.

#### Acceptance Criteria

1. WHEN a user invokes the Leaderboard_Command with a game filter, THE Leaderboard_Service SHALL include only wagers for the specified game from Supported_Games.
2. WHEN no game filter is specified, THE Leaderboard_Service SHALL include wagers across all Supported_Games.
3. WHEN a user specifies a game filter, THE Leaderboard_Embed SHALL display the game name in the embed title.

### Requirement 4: Mode Separation

**User Story:** As a player, I want separate leaderboards for real money and freeplay, so that real-money competition standings are not diluted by freeplay results.

#### Acceptance Criteria

1. WHEN a user invokes the Leaderboard_Command with a Mode of "real", THE Leaderboard_Service SHALL include only wagers with mode "real".
2. WHEN a user invokes the Leaderboard_Command with a Mode of "freeplay", THE Leaderboard_Service SHALL include only wagers with mode "freeplay".
3. WHEN no Mode is specified, THE Leaderboard_Command SHALL default to the "real" mode.
4. THE Leaderboard_Embed SHALL display the active Mode in the embed footer so players can distinguish between real and freeplay rankings.

### Requirement 5: Streak Tracking

**User Story:** As a player, I want my win streaks tracked and displayed, so that I can showcase sustained dominance.

#### Acceptance Criteria

1. WHEN a wager is settled, THE Leaderboard_Service SHALL recalculate the winner's current Win_Streak by incrementing the streak count by 1.
2. WHEN a wager is settled, THE Leaderboard_Service SHALL reset the loser's current Win_Streak to 0.
3. WHEN a player's current Win_Streak exceeds the player's stored Best_Streak for the active Season, THE Leaderboard_Service SHALL update the Best_Streak to match the current Win_Streak.
4. THE Player_Stats object SHALL include both the current Win_Streak and the Best_Streak values.
5. WHEN a wager is cancelled or refunded, THE Leaderboard_Service SHALL leave both players' Win_Streak values unchanged.

### Requirement 6: Formatted Discord Embed Response

**User Story:** As a player, I want the leaderboard displayed as a rich Discord embed, so that it is visually clear and easy to read.

#### Acceptance Criteria

1. THE Leaderboard_Command SHALL respond with a Discord embed containing the top 10 players for the selected filters.
2. THE Leaderboard_Command SHALL display a medal emoji (🥇, 🥈, 🥉) for the top 3 positions and numeric rank for positions 4 through 10.
3. WHEN the Ranking_Category is "wins", each entry in the embed SHALL display the player's username, win count, loss count, and win rate percentage.
4. WHEN the Ranking_Category is "earnings", each entry in the embed SHALL display the player's username, net Earnings value, and total wagers played.
5. WHEN the Ranking_Category is "streak", each entry in the embed SHALL display the player's username, current Win_Streak, and Best_Streak.
6. WHEN the Ranking_Category is "reputation", each entry in the embed SHALL display the player's username, reputation score, and reputation tier name.
7. WHEN the Ranking_Category is "win_rate", each entry in the embed SHALL display the player's username, win rate percentage, and total wagers played.
8. THE Leaderboard_Command SHALL include the active Ranking_Category, Time_Window, game filter, and Mode in the embed title or description.
9. IF no players have settled wagers matching the active filters, THEN THE Leaderboard_Command SHALL respond with an embed stating "No results found for the selected filters."

### Requirement 7: Persistent Auto-Updating Leaderboard Channel

**User Story:** As a server member, I want a dedicated leaderboard channel that always shows current standings, so that I can check rankings without running a command.

#### Acceptance Criteria

1. THE Leaderboard_Embed SHALL be posted as a persistent message in the `#leaderboard` Discord channel.
2. THE Leaderboard_Service SHALL update the persistent Leaderboard_Embed on a scheduled interval of 5 minutes.
3. THE persistent Leaderboard_Embed SHALL display the top 10 players for the "wins" Ranking_Category, "seasonal" Time_Window, and "real" Mode by default.
4. THE persistent Leaderboard_Embed SHALL include a "Last updated" timestamp in the embed footer.
5. IF the persistent Leaderboard_Embed message is deleted or missing, THEN THE Leaderboard_Service SHALL create a new persistent message on the next scheduled update.
6. THE persistent Leaderboard_Embed SHALL display separate sections for the top 3 players in each Ranking_Category (wins, earnings, streak) within a single embed.

### Requirement 8: Player Self-Lookup

**User Story:** As a player, I want to see my own rank and stats even if I'm not in the top 10, so that I know where I stand.

#### Acceptance Criteria

1. WHEN the invoking user is not in the top 10 results, THE Leaderboard_Command SHALL append a separator line followed by the invoking user's rank and Player_Stats at the bottom of the embed.
2. WHEN the invoking user has no settled wagers matching the active filters, THE Leaderboard_Command SHALL display "You have no results for these filters" in the user's stats section.
3. THE Player_Stats displayed for the invoking user SHALL use the same Ranking_Category, Time_Window, game filter, and Mode as the main leaderboard.

### Requirement 9: Seasonal Reset and Archival

**User Story:** As a platform operator, I want leaderboard seasons that reset periodically, so that new players have a fair chance and competition stays fresh.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL define a Season as a 30-day period starting from a configured season start date.
2. WHEN a Season ends, THE Leaderboard_Service SHALL archive the final top 10 standings for each Ranking_Category.
3. WHEN a new Season begins, THE Leaderboard_Service SHALL reset all seasonal Win_Streak and Best_Streak counters to 0.
4. WHEN a new Season begins, THE Leaderboard_Service SHALL update the persistent Leaderboard_Embed to reflect the new empty Season.
5. THE Leaderboard_Service SHALL store the season start date and season number so that archived standings can be retrieved by season.

### Requirement 10: Slash Command Options

**User Story:** As a player, I want the `/leaderboard` command to accept optional filters, so that I can customize the view without multiple commands.

#### Acceptance Criteria

1. THE Leaderboard_Command SHALL accept an optional "category" string option with choices: "wins", "earnings", "win_rate", "streak", "reputation".
2. THE Leaderboard_Command SHALL accept an optional "period" string option with choices: "weekly", "monthly", "seasonal", "all-time".
3. THE Leaderboard_Command SHALL accept an optional "game" string option with choices matching the Supported_Games list.
4. THE Leaderboard_Command SHALL accept an optional "mode" string option with choices: "real", "freeplay".
5. THE Leaderboard_Command SHALL apply all specified options as combined filters when querying the Leaderboard_Service.

### Requirement 11: Efficient Data Retrieval

**User Story:** As a platform operator, I want leaderboard queries to be efficient, so that the bot remains responsive as the player base grows.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL compute rankings using SQL aggregation queries against the wagers table rather than loading all wagers into application memory.
2. THE Leaderboard_Service SHALL use database indexes on the wagers table columns used for filtering (status, game, mode, settledAt, winnerId).
3. WHEN the persistent Leaderboard_Embed update runs, THE Leaderboard_Service SHALL complete the data retrieval within 3 seconds for up to 10,000 settled wagers.
