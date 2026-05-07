# Implementation Plan: Leaderboard System

## Overview

Replace the existing minimal `handleLeaderboard` function with a comprehensive leaderboard system. Implementation proceeds bottom-up: schema changes first, then the core `LeaderboardService`, streak integration, command handler, persistent embed, scheduler integration, and finally seasonal reset logic.

## Tasks

- [x] 1. Database schema changes and migration
  - [x] 1.1 Add streak columns and new tables to schema
    - Add `currentStreak` (integer, default 0) and `bestStreak` (integer, default 0) columns to the `users` table in `src/db/schema.ts`
    - Add `seasons` table with columns: `id`, `seasonNumber` (unique), `startDate`, `endDate`, `active` (integer default 1), `createdAt`
    - Add `seasonArchives` table with columns: `id`, `seasonNumber`, `category`, `rank`, `userId`, `username`, `value`, `archivedAt` and index on `seasonNumber`
    - Add indexes on `wagers` table: `idx_wagers_settled_at` (settledAt), `idx_wagers_winner` (winnerId), `idx_wagers_game` (game), `idx_wagers_mode` (mode)
    - _Requirements: 5.1, 5.2, 5.3, 9.1, 9.5, 11.2_

  - [x] 1.2 Generate Drizzle migration
    - Run `npx drizzle-kit generate` to create the SQL migration for the new columns, tables, and indexes
    - _Requirements: 11.2_

- [x] 2. Implement LeaderboardService core ranking queries
  - [x] 2.1 Create `src/services/leaderboard.ts` with types, interfaces, and class skeleton
    - Define `RankingCategory`, `TimeWindow`, `GameFilter`, `ModeFilter` types
    - Define `LeaderboardFilters`, `PlayerStats`, `LeaderboardResult` interfaces
    - Export `LeaderboardService` class and singleton `leaderboardService` instance
    - Implement `getCurrentSeason()` — returns current season info, creates Season 1 if none exists
    - Implement `getDateRangeForWindow(period, seasonStart)` helper — computes start date for weekly (7 days), monthly (30 days), seasonal (season start), all-time (null)
    - _Requirements: 1.6, 2.5, 9.1, 9.5_

  - [x] 2.2 Implement `getLeaderboard()` with SQL aggregation queries
    - Implement wins ranking: SQL aggregation on `wagers` table grouped by `winnerId`, counting wins and computing losses via subquery, sorted descending by win count
    - Implement earnings ranking: SQL aggregation computing net profit (sum of winnings minus sum of losses) per player, sorted descending
    - Implement win_rate ranking: same as wins but sorted by `wins / totalWagers` descending, with `HAVING COUNT(*) >= 5` filter
    - Implement streak ranking: query `users` table sorted by `currentStreak` descending, filtered by players who have settled wagers matching the filters
    - Implement reputation ranking: query `users` table sorted by `reputation` descending, filtered by players who have settled wagers matching the filters
    - Apply time window filtering using `settledAt >= startDate` on all queries
    - Apply game filter using `game = $game` when specified
    - Apply mode filter using `mode = $mode` on all queries
    - Limit results to top 10
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 11.1_

  - [x] 2.3 Implement `getPlayerStats()` for self-lookup
    - Compute a single player's stats (wins, losses, winRate, earnings, currentStreak, bestStreak, reputation, totalWagers) using the same filter logic as `getLeaderboard`
    - Compute the player's rank by counting how many players rank above them for the active category
    - Return null if the player has no settled wagers matching the filters
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.4 Write property test: ranking sort order (Property 1)
    - **Property 1: Ranking sort order is correct for any category**
    - Create `src/__tests__/leaderboard.property.test.ts`
    - Generate random sets of `PlayerStats` entries and verify `getLeaderboard` returns them sorted descending by the correct metric for each category
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [x] 2.5 Write property test: time window filtering (Property 2)
    - **Property 2: Time window filtering excludes out-of-range wagers**
    - Generate random wager datasets with varying `settledAt` dates and verify only wagers within the specified window contribute to stats
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 2.6 Write property test: game and mode filters (Property 3)
    - **Property 3: Game and mode filters restrict included wagers**
    - Generate random wager datasets with varying game and mode values and verify only matching wagers contribute to stats
    - **Validates: Requirements 3.1, 3.2, 4.1, 4.2**

  - [x] 2.7 Write property test: leaderboard result size bounded (Property 11)
    - **Property 11: Leaderboard result size is bounded**
    - Generate random numbers of eligible players and verify `entries` array has at most 10 and at least 0 elements
    - **Validates: Requirements 6.1**

- [x] 3. Implement streak tracking
  - [x] 3.1 Implement `updateStreaks()` in `LeaderboardService`
    - Increment winner's `currentStreak` by 1 using SQL `SET current_streak = current_streak + 1`
    - Reset loser's `currentStreak` to 0
    - Update each player's `bestStreak` to `GREATEST(best_streak, current_streak)` after the streak change
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.2 Hook streak updates into `WagerService.settleWager`
    - Import `leaderboardService` in `src/services/wager.ts`
    - Call `leaderboardService.updateStreaks(winnerId, loserId, wager.mode, wager.game)` after the wager status is set to "settled" in `settleWager()`
    - Wrap in try/catch so streak failures don't block settlement
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 3.3 Write property test: streak update invariants (Property 4)
    - **Property 4: Streak update invariants on settlement**
    - Generate random pre-settlement streak values for winner and loser, call `updateStreaks`, verify winner's streak = previous + 1, loser's streak = 0, bestStreak = max(previous, new)
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 3.4 Write property test: cancellation preserves streaks (Property 5)
    - **Property 5: Cancellation and refund preserve streaks**
    - Generate random streak values, simulate cancellation/refund, verify streaks unchanged
    - **Validates: Requirements 5.5**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Discord embed formatting
  - [x] 5.1 Implement `buildLeaderboardEmbed()` in `LeaderboardService`
    - Build a Discord `EmbedBuilder` with the top 10 entries
    - Use medal emojis (🥇, 🥈, 🥉) for positions 1-3, numeric rank for 4-10
    - Format each entry based on the active `RankingCategory`:
      - wins: username, win count, loss count, win rate %
      - earnings: username, net earnings, total wagers
      - win_rate: username, win rate %, total wagers
      - streak: username, current streak, best streak
      - reputation: username, reputation score, tier name (using `reputationService.getTier` pattern)
    - Include active category, time window, game filter, and mode in embed title/description
    - Display mode in embed footer
    - Display game name in title when game filter is active
    - Show "No results found for the selected filters." when entries array is empty
    - Append separator + invoking user's rank and stats when user is not in top 10
    - Show "You have no results for these filters" when user has no matching wagers
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 3.3, 4.4, 8.1, 8.2_

  - [x] 5.2 Write property test: category-specific embed fields (Property 6)
    - **Property 6: Category-specific embed entry contains all required fields**
    - Generate random `PlayerStats` and category, verify formatted entry contains all required fields for that category
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.7**

  - [x] 5.3 Write property test: medal and rank formatting (Property 7)
    - **Property 7: Medal and rank formatting**
    - Generate leaderboard results with 1-10 entries, verify positions 1-3 have medal emojis and 4+ have numeric rank
    - **Validates: Requirements 6.2**

  - [x] 5.4 Write property test: embed metadata reflects filters (Property 8)
    - **Property 8: Embed metadata reflects active filters**
    - Generate random filter combinations, build embed, verify title/description contains category, period, game, and mode
    - **Validates: Requirements 6.8, 4.4**

  - [x] 5.5 Write property test: self-lookup rank with same filters (Property 9)
    - **Property 9: Self-lookup returns correct rank with same filters**
    - Generate a user not in top 10, verify `userEntry.rank > 10` and filters match
    - **Validates: Requirements 8.1, 8.3**

- [x] 6. Update slash command and handler
  - [x] 6.1 Update `/leaderboard` command definition in `src/bot/commands.ts`
    - Replace the existing `/leaderboard` command with the new definition that includes optional `category`, `period`, `game`, and `mode` string options with the choices defined in the design
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 6.2 Replace `handleLeaderboard` in `src/bot/handler.ts`
    - Extract filter options from interaction: `category` (default "wins"), `period` (default "seasonal"), `game` (optional), `mode` (default "real")
    - Call `leaderboardService.getLeaderboard(filters, userId)` to get the `LeaderboardResult`
    - Call `leaderboardService.buildLeaderboardEmbed(result)` to build the embed
    - Reply with the embed (ephemeral: false so others can see)
    - _Requirements: 1.6, 2.5, 4.3, 10.5_

  - [x] 6.3 Write unit tests for command handler defaults and filter passing
    - Test default filter values: category=wins, period=seasonal, mode=real
    - Test empty leaderboard returns "No results" embed
    - Test self-lookup when user is in top 10 (no separate entry appended)
    - Test self-lookup when user has no matching wagers
    - _Requirements: 1.6, 2.5, 4.3, 6.9, 8.2_

- [x] 7. Implement persistent auto-updating leaderboard embed
  - [x] 7.1 Implement `buildPersistentEmbed()` in `LeaderboardService`
    - Build a single embed with separate sections for top 3 players in wins, earnings, and streak categories
    - Use "seasonal" time window and "real" mode as defaults
    - Include "Last updated" timestamp in embed footer
    - _Requirements: 7.3, 7.4, 7.6_

  - [x] 7.2 Implement `refreshPersistentEmbed()` in `LeaderboardService`
    - Find the `#leaderboard` channel in the guild by name
    - Fetch the last message in the channel; if it was sent by the bot, edit it with the new embed
    - If no bot message exists (deleted or first run), send a new message
    - Silently skip if `#leaderboard` channel doesn't exist
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 7.3 Add `refreshLeaderboard()` to `Scheduler` in `src/services/scheduler.ts`
    - Add a 5-minute interval counter that calls `leaderboardService.refreshPersistentEmbed(guildId)` for each guild the bot is in
    - Call from `tick()` only when the 5-minute interval has elapsed
    - _Requirements: 7.2_

- [x] 8. Implement seasonal reset and archival
  - [x] 8.1 Implement `archiveSeason()` in `LeaderboardService`
    - Query top 10 for each ranking category (wins, earnings, streak) for the ending season
    - Insert rows into `seasonArchives` table with season number, category, rank, userId, username, and metric value
    - _Requirements: 9.2, 9.5_

  - [x] 8.2 Implement `checkSeasonRollover()` in `LeaderboardService`
    - Check if current date is past the active season's `endDate`
    - If so: archive the ending season, mark it inactive, create a new season (seasonNumber + 1, startDate = now, endDate = now + 30 days)
    - Reset all users' `currentStreak` and `bestStreak` to 0
    - Refresh the persistent embed to show the new empty season
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.3 Add `checkSeasonRollover()` call to `Scheduler.tick()` in `src/services/scheduler.ts`
    - Call `leaderboardService.checkSeasonRollover()` on every tick (lightweight date comparison)
    - _Requirements: 9.1_

  - [x] 8.4 Write property test: season duration (Property 10)
    - **Property 10: Season duration is exactly 30 days**
    - Generate random season start dates, verify end date is exactly 30 * 24 * 60 * 60 * 1000 ms after start
    - **Validates: Requirements 9.1**

- [x] 9. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `fast-check` and `vitest` setup is reused (see `src/__tests__/lobby.property.test.ts` for patterns)
