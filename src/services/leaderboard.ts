import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wagers, seasons, seasonArchives } from "../db/schema.js";
import { nanoid } from "nanoid";
import { EmbedBuilder } from "discord.js";
import { getGameProfile } from "./games/profiles.js";

// ── Types ──

export type RankingCategory = "wins" | "earnings" | "win_rate" | "streak" | "reputation";
export type TimeWindow = "weekly" | "monthly" | "seasonal" | "all-time";
export type GameFilter = "fifa" | "lol" | "valorant" | "rocketleague" | "cod" | "fortnite" | "nba2k" | "madden" | "mariokart" | "other";
export type ModeFilter = "real" | "freeplay";

// ── Interfaces ──

export interface LeaderboardFilters {
  category: RankingCategory;   // default: "wins"
  period: TimeWindow;          // default: "seasonal"
  game?: GameFilter;           // default: all games
  mode: ModeFilter;            // default: "real"
}

export interface PlayerStats {
  userId: string;
  username: string;
  rank: number;
  wins: number;
  losses: number;
  winRate: number;           // percentage 0-100
  earnings: number;          // net profit (winnings - losses)
  currentStreak: number;
  bestStreak: number;
  reputation: number;
  totalWagers: number;
}

export interface LeaderboardResult {
  entries: PlayerStats[];      // top 10
  userEntry?: PlayerStats | null;  // invoking user's stats (undefined = in top 10 or no userId, null = no matching wagers)
  filters: LeaderboardFilters;
  seasonNumber: number;
  seasonStartDate: Date;
}

// ── Service ──

export class LeaderboardService {

  /** Get the current active season, creating Season 1 if none exists */
  async getCurrentSeason(): Promise<{ id: string; seasonNumber: number; startDate: Date; endDate: Date }> {
    const [activeSeason] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.active, 1));

    if (activeSeason) {
      return {
        id: activeSeason.id,
        seasonNumber: activeSeason.seasonNumber,
        startDate: activeSeason.startDate,
        endDate: activeSeason.endDate,
      };
    }

    // No active season — create Season 1
    const now = new Date();
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const id = nanoid();

    await db.insert(seasons).values({
      id,
      seasonNumber: 1,
      startDate: now,
      endDate,
      active: 1,
    });

    return { id, seasonNumber: 1, startDate: now, endDate };
  }

  /** Compute the start date for a given time window */
  getDateRangeForWindow(period: TimeWindow, seasonStart: Date): Date | null {
    const now = new Date();

    switch (period) {
      case "weekly":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "monthly":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "seasonal":
        return seasonStart;
      case "all-time":
        return null;
    }
  }

  /** Query top 10 players for the given filters */
  async getLeaderboard(filters: LeaderboardFilters, userId?: string): Promise<LeaderboardResult> {
    const season = await this.getCurrentSeason();
    const startDate = this.getDateRangeForWindow(filters.period, season.startDate);

    // Build common WHERE clause fragments — convert Date to ISO string for postgres driver
    const startDateStr = startDate ? startDate.toISOString() : null;
    const timeFilter = startDateStr ? sql`AND w."settled_at" >= ${startDateStr}::timestamp` : sql``;
    const gameFilter = filters.game ? sql`AND w."game" = ${filters.game}` : sql``;
    const modeFilter = sql`AND w."mode" = ${filters.mode}`;
    const baseWhere = sql`w."status" = 'settled' ${modeFilter} ${gameFilter} ${timeFilter}`;

    let rows: any[];

    switch (filters.category) {
      case "wins": {
        const result = await db.execute(sql`
          SELECT
            w."winner_id" AS "userId",
            u."username",
            COUNT(*)::int AS "wins",
            (
              SELECT COUNT(*)::int FROM wagers w2
              WHERE (w2."creator_id" = w."winner_id" OR w2."opponent_id" = w."winner_id")
                AND w2."status" = 'settled'
                AND w2."winner_id" != w."winner_id"
                AND w2."mode" = ${filters.mode}
                ${filters.game ? sql`AND w2."game" = ${filters.game}` : sql``}
                ${startDateStr ? sql`AND w2."settled_at" >= ${startDateStr}::timestamp` : sql``}
            ) AS "losses",
            u."current_streak" AS "currentStreak",
            u."best_streak" AS "bestStreak",
            u."reputation"
          FROM wagers w
          JOIN users u ON u.id = w."winner_id"
          WHERE ${baseWhere}
          GROUP BY w."winner_id", u."username", u."current_streak", u."best_streak", u."reputation"
          ORDER BY "wins" DESC
          LIMIT 10
        `);
        rows = [...result];
        break;
      }

      case "earnings": {
        const result = await db.execute(sql`
          SELECT
            u.id AS "userId",
            u."username",
            (
              SUM(CASE WHEN w."winner_id" = u.id THEN w."amount" * 2 - w."fee" ELSE 0 END)
              - SUM(CASE WHEN w."winner_id" != u.id THEN w."amount" ELSE 0 END)
            )::int AS "earnings",
            COUNT(*)::int AS "totalWagers",
            SUM(CASE WHEN w."winner_id" = u.id THEN 1 ELSE 0 END)::int AS "wins",
            SUM(CASE WHEN w."winner_id" != u.id THEN 1 ELSE 0 END)::int AS "losses",
            u."current_streak" AS "currentStreak",
            u."best_streak" AS "bestStreak",
            u."reputation"
          FROM users u
          JOIN wagers w ON (w."creator_id" = u.id OR w."opponent_id" = u.id)
          WHERE ${baseWhere}
          GROUP BY u.id, u."username", u."current_streak", u."best_streak", u."reputation"
          ORDER BY "earnings" DESC
          LIMIT 10
        `);
        rows = [...result];
        break;
      }

      case "win_rate": {
        const result = await db.execute(sql`
          SELECT
            u.id AS "userId",
            u."username",
            COUNT(*)::int AS "totalWagers",
            SUM(CASE WHEN w."winner_id" = u.id THEN 1 ELSE 0 END)::int AS "wins",
            SUM(CASE WHEN w."winner_id" != u.id THEN 1 ELSE 0 END)::int AS "losses",
            ROUND(
              SUM(CASE WHEN w."winner_id" = u.id THEN 1 ELSE 0 END)::numeric
              / COUNT(*)::numeric * 100, 1
            )::float AS "winRate",
            u."current_streak" AS "currentStreak",
            u."best_streak" AS "bestStreak",
            u."reputation"
          FROM users u
          JOIN wagers w ON (w."creator_id" = u.id OR w."opponent_id" = u.id)
          WHERE ${baseWhere}
          GROUP BY u.id, u."username", u."current_streak", u."best_streak", u."reputation"
          HAVING COUNT(*) >= 5
          ORDER BY "winRate" DESC
          LIMIT 10
        `);
        rows = [...result];
        break;
      }

      case "streak": {
        const result = await db.execute(sql`
          SELECT
            u.id AS "userId",
            u."username",
            u."current_streak" AS "currentStreak",
            u."best_streak" AS "bestStreak",
            u."reputation"
          FROM users u
          WHERE EXISTS (
            SELECT 1 FROM wagers w
            WHERE (w."creator_id" = u.id OR w."opponent_id" = u.id)
              AND ${baseWhere}
          )
          ORDER BY u."current_streak" DESC
          LIMIT 10
        `);
        rows = [...result];
        break;
      }

      case "reputation": {
        const result = await db.execute(sql`
          SELECT
            u.id AS "userId",
            u."username",
            u."reputation",
            u."current_streak" AS "currentStreak",
            u."best_streak" AS "bestStreak"
          FROM users u
          WHERE EXISTS (
            SELECT 1 FROM wagers w
            WHERE (w."creator_id" = u.id OR w."opponent_id" = u.id)
              AND ${baseWhere}
          )
          ORDER BY u."reputation" DESC
          LIMIT 10
        `);
        rows = [...result];
        break;
      }

      default:
        rows = [];
    }

    // Map rows to PlayerStats
    const entries: PlayerStats[] = rows.map((row: any, index: number) => {
      const wins = Number(row.wins ?? 0);
      const losses = Number(row.losses ?? 0);
      const totalWagers = Number(row.totalWagers ?? wins + losses);
      const winRate = Number(row.winRate ?? (totalWagers > 0 ? (wins / totalWagers) * 100 : 0));

      return {
        userId: row.userId,
        username: row.username,
        rank: index + 1,
        wins,
        losses,
        winRate: Math.round(winRate * 10) / 10,
        earnings: Number(row.earnings ?? 0),
        currentStreak: Number(row.currentStreak ?? 0),
        bestStreak: Number(row.bestStreak ?? 0),
        reputation: Number(row.reputation ?? 0),
        totalWagers,
      };
    });

    // Check if userId is in top 10
    let userEntry: PlayerStats | null | undefined;
    if (userId) {
      const inTop10 = entries.some((e) => e.userId === userId);
      if (!inTop10) {
        const stats = await this.getPlayerStats(userId, filters);
        userEntry = stats; // null if no matching wagers, PlayerStats if found
      }
    }

    return {
      entries,
      userEntry,
      filters,
      seasonNumber: season.seasonNumber,
      seasonStartDate: season.startDate,
    };
  }

  /** Compute a single player's stats for the given filters */
  async getPlayerStats(userId: string, filters: LeaderboardFilters): Promise<PlayerStats | null> {
    const season = await this.getCurrentSeason();
    const startDate = this.getDateRangeForWindow(filters.period, season.startDate);

    // Build common WHERE clause fragments (same as getLeaderboard)
    const startDateStr = startDate ? startDate.toISOString() : null;
    const timeFilter = startDateStr ? sql`AND w."settled_at" >= ${startDateStr}::timestamp` : sql``;
    const gameFilter = filters.game ? sql`AND w."game" = ${filters.game}` : sql``;
    const modeFilter = sql`AND w."mode" = ${filters.mode}`;
    const baseWhere = sql`w."status" = 'settled' ${modeFilter} ${gameFilter} ${timeFilter}`;

    // Get the player's stats from their settled wagers
    const statsResult = await db.execute(sql`
      SELECT
        u.id AS "userId",
        u."username",
        COUNT(*)::int AS "totalWagers",
        SUM(CASE WHEN w."winner_id" = u.id THEN 1 ELSE 0 END)::int AS "wins",
        SUM(CASE WHEN w."winner_id" != u.id THEN 1 ELSE 0 END)::int AS "losses",
        ROUND(
          SUM(CASE WHEN w."winner_id" = u.id THEN 1 ELSE 0 END)::numeric
          / NULLIF(COUNT(*)::numeric, 0) * 100, 1
        )::float AS "winRate",
        (
          SUM(CASE WHEN w."winner_id" = u.id THEN w."amount" * 2 - w."fee" ELSE 0 END)
          - SUM(CASE WHEN w."winner_id" != u.id THEN w."amount" ELSE 0 END)
        )::int AS "earnings",
        u."current_streak" AS "currentStreak",
        u."best_streak" AS "bestStreak",
        u."reputation"
      FROM users u
      JOIN wagers w ON (w."creator_id" = u.id OR w."opponent_id" = u.id)
      WHERE u.id = ${userId}
        AND ${baseWhere}
      GROUP BY u.id, u."username", u."current_streak", u."best_streak", u."reputation"
    `);

    const rows = [...statsResult];
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as any;
    const wins = Number(row.wins ?? 0);
    const losses = Number(row.losses ?? 0);
    const totalWagers = Number(row.totalWagers ?? 0);
    const winRate = Number(row.winRate ?? 0);
    const earnings = Number(row.earnings ?? 0);
    const currentStreak = Number(row.currentStreak ?? 0);
    const bestStreak = Number(row.bestStreak ?? 0);
    const reputation = Number(row.reputation ?? 0);

    // Compute rank by counting how many players rank above this player for the active category
    let rankResult: any[];

    switch (filters.category) {
      case "wins": {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS "rank"
          FROM (
            SELECT w."winner_id", COUNT(*) AS cnt
            FROM wagers w
            WHERE ${baseWhere}
            GROUP BY w."winner_id"
            HAVING COUNT(*) > ${wins}
          ) ranked
        `);
        rankResult = [...result];
        break;
      }

      case "earnings": {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS "rank"
          FROM (
            SELECT u2.id,
              (
                SUM(CASE WHEN w."winner_id" = u2.id THEN w."amount" * 2 - w."fee" ELSE 0 END)
                - SUM(CASE WHEN w."winner_id" != u2.id THEN w."amount" ELSE 0 END)
              ) AS net
            FROM users u2
            JOIN wagers w ON (w."creator_id" = u2.id OR w."opponent_id" = u2.id)
            WHERE ${baseWhere}
            GROUP BY u2.id
            HAVING (
              SUM(CASE WHEN w."winner_id" = u2.id THEN w."amount" * 2 - w."fee" ELSE 0 END)
              - SUM(CASE WHEN w."winner_id" != u2.id THEN w."amount" ELSE 0 END)
            ) > ${earnings}
          ) ranked
        `);
        rankResult = [...result];
        break;
      }

      case "win_rate": {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS "rank"
          FROM (
            SELECT u2.id,
              ROUND(
                SUM(CASE WHEN w."winner_id" = u2.id THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(*)::numeric, 0) * 100, 1
              ) AS wr
            FROM users u2
            JOIN wagers w ON (w."creator_id" = u2.id OR w."opponent_id" = u2.id)
            WHERE ${baseWhere}
            GROUP BY u2.id
            HAVING COUNT(*) >= 5
              AND ROUND(
                SUM(CASE WHEN w."winner_id" = u2.id THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(*)::numeric, 0) * 100, 1
              ) > ${winRate}
          ) ranked
        `);
        rankResult = [...result];
        break;
      }

      case "streak": {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS "rank"
          FROM users u2
          WHERE u2."current_streak" > ${currentStreak}
            AND EXISTS (
              SELECT 1 FROM wagers w
              WHERE (w."creator_id" = u2.id OR w."opponent_id" = u2.id)
                AND ${baseWhere}
            )
        `);
        rankResult = [...result];
        break;
      }

      case "reputation": {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS "rank"
          FROM users u2
          WHERE u2."reputation" > ${reputation}
            AND EXISTS (
              SELECT 1 FROM wagers w
              WHERE (w."creator_id" = u2.id OR w."opponent_id" = u2.id)
                AND ${baseWhere}
            )
        `);
        rankResult = [...result];
        break;
      }

      default:
        rankResult = [{ rank: 0 }];
    }

    const playersAbove = Number((rankResult[0] as any)?.rank ?? 0);
    const rank = playersAbove + 1;

    return {
      userId: row.userId,
      username: row.username,
      rank,
      wins,
      losses,
      winRate: Math.round(winRate * 10) / 10,
      earnings,
      currentStreak,
      bestStreak,
      reputation,
      totalWagers,
    };
  }

  /** Update win/loss streaks after a wager settles */
  async updateStreaks(winnerId: string, loserId: string, _mode: ModeFilter, _game: string): Promise<void> {
    // Increment winner's current streak and update best streak atomically
    await db.update(users)
      .set({
        currentStreak: sql`${users.currentStreak} + 1`,
        bestStreak: sql`GREATEST(${users.bestStreak}, ${users.currentStreak} + 1)`,
      })
      .where(eq(users.id, winnerId));

    // Reset loser's current streak to 0 (bestStreak unchanged since new value is 0)
    await db.update(users)
      .set({ currentStreak: 0 })
      .where(eq(users.id, loserId));
  }

  /** Build a Discord embed for a leaderboard result */
  buildLeaderboardEmbed(result: LeaderboardResult): EmbedBuilder {
    const { entries, userEntry, filters, seasonNumber } = result;

    const categoryNames: Record<RankingCategory, string> = {
      wins: "Top Wins",
      earnings: "Top Earnings",
      win_rate: "Top Win Rate",
      streak: "Top Streaks",
      reputation: "Top Reputation",
    };

    const windowNames: Record<TimeWindow, string> = {
      weekly: "Weekly",
      monthly: "Monthly",
      seasonal: `Season ${seasonNumber}`,
      "all-time": "All Time",
    };

    // Build title
    let title = `${categoryNames[filters.category]} — ${windowNames[filters.period]}`;
    if (filters.game) {
      const profile = getGameProfile(filters.game);
      const gameName = profile?.name ?? filters.game;
      title += ` — ${gameName}`;
    }

    // Build footer
    const modeLabel = filters.mode === "real" ? "Real Money" : "Freeplay";
    const footer = `Mode: ${modeLabel}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x00b4d8)
      .setFooter({ text: footer });

    // Empty results
    if (entries.length === 0) {
      embed.setDescription("No results found for the selected filters.");
      return embed;
    }

    // Format entries
    const lines: string[] = entries.map((entry, i) => {
      const rank = i + 1;
      const prefix = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
      return `${prefix} ${this.formatEntry(entry, filters.category)}`;
    });

    // Append user entry if not in top 10
    if (userEntry) {
      lines.push("───────────────");
      const prefix = `${userEntry.rank}.`;
      lines.push(`${prefix} ${this.formatEntry(userEntry, filters.category)}`);
    } else if (userEntry === null) {
      // User was looked up but has no matching wagers
      lines.push("───────────────");
      lines.push("You have no results for these filters");
    }

    embed.setDescription(lines.join("\n"));
    return embed;
  }

  /** Format a single leaderboard entry based on the active category */
  private formatEntry(entry: PlayerStats, category: RankingCategory): string {
    switch (category) {
      case "wins":
        return `**${entry.username}** — ${entry.wins}W / ${entry.losses}L (${entry.winRate}%)`;
      case "earnings":
        return `**${entry.username}** — ${entry.earnings} net / ${entry.totalWagers} wagers`;
      case "win_rate":
        return `**${entry.username}** — ${entry.winRate}% / ${entry.totalWagers} wagers`;
      case "streak":
        return `**${entry.username}** — ${entry.currentStreak} current / ${entry.bestStreak} best`;
      case "reputation":
        return `**${entry.username}** — ${entry.reputation} rep (${this.getTierName(entry.reputation)})`;
    }
  }

  /** Get reputation tier name (mirrors ReputationService.getTier) */
  private getTierName(reputation: number): string {
    if (reputation >= 1000) return "Legend";
    if (reputation >= 500) return "Elite";
    if (reputation >= 300) return "Veteran";
    if (reputation >= 150) return "Trusted";
    if (reputation >= 100) return "Good";
    if (reputation >= 50) return "Caution";
    return "Untrusted";
  }

  /** Build a leaderboard embed for a specific mode and optional game */
  async buildSectionEmbed(
    seasonNumber: number,
    mode: ModeFilter,
    game?: GameFilter,
  ): Promise<EmbedBuilder> {
    const baseFilters: Omit<LeaderboardFilters, "category"> = {
      period: "seasonal",
      mode,
      ...(game ? { game } : {}),
    };

    const [winsResult, earningsResult, streakResult] = await Promise.all([
      this.getLeaderboard({ ...baseFilters, category: "wins" }),
      this.getLeaderboard({ ...baseFilters, category: "earnings" }),
      this.getLeaderboard({ ...baseFilters, category: "streak" }),
    ]);

    const medals = ["🥇", "🥈", "🥉"];

    const formatTop3 = (entries: PlayerStats[], category: RankingCategory): string => {
      if (entries.length === 0) return "No players yet";
      return entries.slice(0, 3).map((entry, i) => {
        return `${medals[i]} ${this.formatEntry(entry, category)}`;
      }).join("\n");
    };

    const modeLabel = mode === "real" ? "💰 MP" : "🎮 FP";
    const gameProfile = game ? getGameProfile(game) : null;
    const gameName = gameProfile?.name ?? null;
    const title = gameName
      ? `${gameName} — ${modeLabel} — Season ${seasonNumber}`
      : `🏆 Global ${modeLabel} Leaderboard — Season ${seasonNumber}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(mode === "real" ? 0x00b4d8 : 0x9b59b6);

    if (gameProfile?.thumbnailUrl) {
      embed.setThumbnail(gameProfile.thumbnailUrl);
    }

    embed.addFields(
      { name: "🥇 Top Wins", value: formatTop3(winsResult.entries, "wins"), inline: false },
      { name: "💰 Top Earnings", value: formatTop3(earningsResult.entries, "earnings"), inline: false },
      { name: "🔥 Top Streaks", value: formatTop3(streakResult.entries, "streak"), inline: false },
    );

    const now = new Date();
    embed.setFooter({ text: `Last updated: ${now.toUTCString()}` });

    return embed;
  }

  /** Build the persistent multi-section embed (top 3 per category) — kept for backward compat */
  async buildPersistentEmbed(seasonNumber: number, seasonStart: Date, _guildId: string): Promise<EmbedBuilder> {
    return this.buildSectionEmbed(seasonNumber, "real");
  }

  /** Refresh all persistent embeds in #leaderboard channel */
  async refreshPersistentEmbed(guildId: string): Promise<void> {
    try {
      const { getBotClient } = await import("../bot/notifications.js");
      const client = getBotClient();
      if (!client) return;

      const guild = await client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      const leaderboardChannel = channels.find(
        (c) => c?.isTextBased() && c.name === "leaderboard"
      );
      if (!leaderboardChannel || !leaderboardChannel.isTextBased()) return;

      const season = await this.getCurrentSeason();
      const textChannel = leaderboardChannel as any;

      // Build all embeds: global MP, global FP, then per-game MP
      const games: GameFilter[] = ["fifa", "cod", "valorant", "lol", "rocketleague", "fortnite", "nba2k", "madden", "mariokart"];

      const embeds: EmbedBuilder[] = [];
      embeds.push(await this.buildSectionEmbed(season.seasonNumber, "real"));
      embeds.push(await this.buildSectionEmbed(season.seasonNumber, "freeplay"));
      for (const game of games) {
        embeds.push(await this.buildSectionEmbed(season.seasonNumber, "real", game));
      }

      // Fetch existing bot messages in the channel
      const messages = await textChannel.messages.fetch({ limit: 20 });
      const botMessages = messages
        .filter((m: any) => m.author.id === client.user?.id)
        .sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);

      const botMsgArray = [...botMessages.values()];

      // Update existing messages or send new ones
      for (let i = 0; i < embeds.length; i++) {
        if (i < botMsgArray.length) {
          try {
            await botMsgArray[i].edit({ embeds: [embeds[i]] });
          } catch {
            await textChannel.send({ embeds: [embeds[i]] });
          }
        } else {
          await textChannel.send({ embeds: [embeds[i]] });
        }
      }

      // Delete extra bot messages if we have fewer embeds now
      for (let i = embeds.length; i < botMsgArray.length; i++) {
        try { await botMsgArray[i].delete(); } catch {}
      }
    } catch (err) {
      // Silently skip — channel may not exist or other transient errors
    }
  }

  /** Check if the current season has ended and perform rollover */
  async checkSeasonRollover(): Promise<void> {
    const season = await this.getCurrentSeason();
    const now = new Date();

    if (now <= season.endDate) {
      return; // Season still active, nothing to do
    }

    // 1. Archive the ending season's final standings
    await this.archiveSeason(season.seasonNumber);

    // 2. Mark the current season as inactive
    await db.update(seasons)
      .set({ active: 0 })
      .where(eq(seasons.id, season.id));

    // 3. Create a new season
    const newEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(seasons).values({
      id: nanoid(),
      seasonNumber: season.seasonNumber + 1,
      startDate: now,
      endDate: newEndDate,
      active: 1,
    });

    // 4. Reset all users' streaks
    await db.update(users)
      .set({ currentStreak: 0, bestStreak: 0 });

    // 5. Refresh persistent embed for all guilds
    try {
      const { getBotClient } = await import("../bot/notifications.js");
      const client = getBotClient();
      if (client) {
        for (const [guildId] of client.guilds.cache) {
          await this.refreshPersistentEmbed(guildId);
        }
      }
    } catch (err) {
      console.error("[LeaderboardService] Error refreshing embeds after season rollover:", err);
    }

    console.log(`[LeaderboardService] Season ${season.seasonNumber} ended. Season ${season.seasonNumber + 1} started.`);
  }

  /** Archive final standings for a completed season */
  async archiveSeason(seasonNumber: number): Promise<void> {
    const categories = ["wins", "earnings", "streak"] as const;

    for (const category of categories) {
      const result = await this.getLeaderboard({
        category,
        period: "seasonal",
        mode: "real",
      });

      const archiveRows = result.entries.slice(0, 10).map((entry, index) => {
        let value: number;
        switch (category) {
          case "wins":
            value = entry.wins;
            break;
          case "earnings":
            value = entry.earnings;
            break;
          case "streak":
            value = entry.currentStreak;
            break;
        }

        return {
          id: nanoid(),
          seasonNumber,
          category,
          rank: index + 1,
          userId: entry.userId,
          username: entry.username,
          value,
        };
      });

      if (archiveRows.length > 0) {
        await db.insert(seasonArchives).values(archiveRows);
      }
    }
  }
}

export const leaderboardService = new LeaderboardService();
