import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RankingCategory,
  TimeWindow,
  GameFilter,
  ModeFilter,
  LeaderboardFilters,
  PlayerStats,
  LeaderboardResult,
} from "../services/leaderboard.js";

// ── Mock external dependencies ──

vi.mock("../db/index.js", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-id-" + Math.random().toString(36).slice(2, 10)),
}));

vi.mock("discord.js", () => {
  class MockEmbedBuilder {
    private data: any = {};
    setTitle(title: string) { this.data.title = title; return this; }
    setDescription(desc: string) { this.data.description = desc; return this; }
    setColor(color: number) { this.data.color = color; return this; }
    setFooter(footer: { text: string }) { this.data.footer = footer; return this; }
    toJSON() { return this.data; }
  }
  return { EmbedBuilder: MockEmbedBuilder };
});

vi.mock("../services/games/profiles.js", () => ({
  getGameProfile: vi.fn((game: string) => {
    const profiles: Record<string, { name: string }> = {
      fifa: { name: "FIFA / EA FC" },
      lol: { name: "League of Legends" },
      valorant: { name: "Valorant" },
      rocketleague: { name: "Rocket League" },
      cod: { name: "Call of Duty" },
      fortnite: { name: "Fortnite" },
      other: { name: "Other" },
    };
    return profiles[game] ?? null;
  }),
}));

// ── Import mocked modules ──

import { LeaderboardService } from "../services/leaderboard.js";

// ── Test Suite ──

describe("Leaderboard Unit Tests", () => {
  let service: LeaderboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LeaderboardService();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 1: Default filter values
  // Validates: Requirements 1.6, 2.5, 4.3
  // ──────────────────────────────────────────────────────────────────────
  describe("Default filter values", () => {
    it("embed reflects default filters: category=wins, period=seasonal, mode=real", () => {
      const defaultFilters: LeaderboardFilters = {
        category: "wins",
        period: "seasonal",
        mode: "real",
      };

      const result: LeaderboardResult = {
        entries: [{
          userId: "user-1",
          username: "Player1",
          rank: 1,
          wins: 10,
          losses: 2,
          winRate: 83.3,
          earnings: 5000,
          currentStreak: 5,
          bestStreak: 8,
          reputation: 300,
          totalWagers: 12,
        }],
        filters: defaultFilters,
        seasonNumber: 1,
        seasonStartDate: new Date("2025-01-01T00:00:00Z"),
      };

      const embed = service.buildLeaderboardEmbed(result);
      const json = (embed as any).toJSON();

      expect(json.title).toContain("Top Wins");
      expect(json.title).toContain("Season 1");
      expect(json.footer.text).toContain("Real Money");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 2: Empty leaderboard returns "No results" embed
  // Validates: Requirements 6.9
  // ──────────────────────────────────────────────────────────────────────
  describe("Empty leaderboard", () => {
    it("returns 'No results found for the selected filters.' when entries are empty", () => {
      const result: LeaderboardResult = {
        entries: [],
        filters: { category: "wins", period: "seasonal", mode: "real" },
        seasonNumber: 1,
        seasonStartDate: new Date("2025-01-01T00:00:00Z"),
      };

      const embed = service.buildLeaderboardEmbed(result);
      const json = (embed as any).toJSON();

      expect(json.description).toBe("No results found for the selected filters.");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 3: Self-lookup when user is in top 10 (no separate entry)
  // Validates: Requirements 8.2
  // ──────────────────────────────────────────────────────────────────────
  describe("Self-lookup when user is in top 10", () => {
    it("does not append a separator or extra entry when userEntry is undefined", () => {
      const entries: PlayerStats[] = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-${i}`,
        username: `Player${i}`,
        rank: i + 1,
        wins: 50 - i * 5,
        losses: i * 3,
        winRate: 80 - i * 5,
        earnings: 3000 - i * 300,
        currentStreak: 8 - i,
        bestStreak: 10 - i,
        reputation: 500 - i * 50,
        totalWagers: 30 - i * 2,
      }));

      const result: LeaderboardResult = {
        entries,
        // userEntry is undefined — user is in top 10
        filters: { category: "wins", period: "seasonal", mode: "real" },
        seasonNumber: 1,
        seasonStartDate: new Date("2025-01-01T00:00:00Z"),
      };

      const embed = service.buildLeaderboardEmbed(result);
      const json = (embed as any).toJSON();
      const description: string = json.description ?? "";

      expect(description).not.toContain("───────────────");
      expect(description).not.toContain("You have no results");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 4: Self-lookup when user has no matching wagers
  // Validates: Requirements 8.2
  // ──────────────────────────────────────────────────────────────────────
  describe("Self-lookup when user has no matching wagers", () => {
    it("shows 'You have no results for these filters' when userEntry is null", () => {
      const entries: PlayerStats[] = [{
        userId: "user-1",
        username: "TopPlayer",
        rank: 1,
        wins: 20,
        losses: 3,
        winRate: 87,
        earnings: 8000,
        currentStreak: 10,
        bestStreak: 12,
        reputation: 600,
        totalWagers: 23,
      }];

      const result: LeaderboardResult = {
        entries,
        userEntry: null,
        filters: { category: "earnings", period: "monthly", mode: "freeplay" },
        seasonNumber: 2,
        seasonStartDate: new Date("2025-02-01T00:00:00Z"),
      };

      const embed = service.buildLeaderboardEmbed(result);
      const json = (embed as any).toJSON();
      const description: string = json.description ?? "";

      expect(description).toContain("───────────────");
      expect(description).toContain("You have no results for these filters");
    });
  });
});
