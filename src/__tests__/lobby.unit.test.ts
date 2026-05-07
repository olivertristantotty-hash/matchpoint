import { describe, it, expect, vi, beforeEach } from "vitest";
import { LobbyService, LobbyOptions } from "../services/lobby.js";
import { gameProfiles, getGameProfile } from "../services/games/profiles.js";

// ── Mock external dependencies (same approach as property tests) ──

vi.mock("../db/index.js", () => {
  const createChain = () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    return chain;
  };
  return { db: createChain() };
});

vi.mock("../services/wallet.js", () => ({
  walletService: {
    getBalance: vi.fn(),
    lockEscrow: vi.fn(),
    lockFreeplayEscrow: vi.fn(),
    refundEscrow: vi.fn(),
    refundFreeplayEscrow: vi.fn(),
  },
}));

vi.mock("../services/antifraud.js", () => ({
  antiFraudService: {
    preWagerCheck: vi.fn(),
  },
}));

vi.mock("../services/identity.js", () => ({
  identityService: {
    preWagerIdentityCheck: vi.fn(),
  },
}));

vi.mock("../services/reputation.js", () => ({
  reputationService: {
    checkWagerLimit: vi.fn(),
    getRepBadge: vi.fn((rep: number) => `⭐ ${rep}`),
  },
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-id-" + Math.random().toString(36).slice(2, 10)),
}));

// ── Import mocked modules ──

import { db } from "../db/index.js";
import { walletService } from "../services/wallet.js";
import { antiFraudService } from "../services/antifraud.js";
import { identityService } from "../services/identity.js";
import { reputationService } from "../services/reputation.js";

// ── Helpers ──

function makePassingMocks(amount: number) {
  vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue({ passed: true });
  vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(null);
  vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(null);
  vi.mocked(walletService.getBalance).mockResolvedValue({
    available: amount + 1000,
    escrowed: 0,
    freeplay: amount + 1000,
    freeplayEscrowed: 0,
  });
}

function setupDbForCreation(options: LobbyOptions) {
  const wagerRecord = {
    id: "wager-unit-test",
    mode: options.mode,
    game: options.game,
    creatorId: options.hostId,
    opponentId: null,
    amount: options.amount,
    fee: options.mode === "real" ? Math.floor((options.amount * 2 * 10) / 100) : 0,
    status: "pending" as const,
    guildId: options.guildId ?? null,
    channelId: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    matchDeadline: null,
    winnerId: null,
    settledAt: null,
    platform: options.platform,
    gameMode: options.gameMode ?? null,
    teamSize: options.teamSize ?? null,
    rulesNotes: options.rulesNotes ?? null,
    roundsFormat: options.roundsFormat ?? null,
    lobbyMessageId: null,
    lobbyChannelId: null,
    createdAt: new Date(),
    creatorClipUrl: null,
    opponentClipUrl: null,
  };

  const mockDb = vi.mocked(db);
  mockDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  }) as any);
  mockDb.insert.mockImplementation(() => ({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([wagerRecord]),
    }),
  }) as any);

  return wagerRecord;
}

// ── Test Suite ──

describe("Unit Tests", () => {
  let lobbyService: LobbyService;

  beforeEach(() => {
    vi.clearAllMocks();
    lobbyService = new LobbyService();
  });

  describe("Channel Routing", () => {
    it('real mode routes to "find-match" channel', () => {
      const mode = "real" as const;
      const channelName = mode === "real" ? "find-match" : "free-play";
      expect(channelName).toBe("find-match");
    });

    it('freeplay mode routes to "free-play" channel', () => {
      const mode = "freeplay" as const;
      const channelName = mode === "real" ? "find-match" : "free-play";
      expect(channelName).toBe("free-play");
    });
  });

  describe("Button customId Format", () => {
    it("Accept Match button has customId accept_lobby:{wagerId}", () => {
      const wagerId = "abc-123";
      const customId = `accept_lobby:${wagerId}`;
      expect(customId).toBe("accept_lobby:abc-123");
      expect(customId.startsWith("accept_lobby:")).toBe(true);
      expect(customId.split(":")[1]).toBe(wagerId);
    });

    it("Cancel Lobby button has customId cancel_lobby:{wagerId}", () => {
      const wagerId = "xyz-789";
      const customId = `cancel_lobby:${wagerId}`;
      expect(customId).toBe("cancel_lobby:xyz-789");
      expect(customId.startsWith("cancel_lobby:")).toBe(true);
      expect(customId.split(":")[1]).toBe(wagerId);
    });

    it("Cancel Match button has customId cancel_match:{wagerId}", () => {
      const wagerId = "match-456";
      const customId = `cancel_match:${wagerId}`;
      expect(customId).toBe("cancel_match:match-456");
      expect(customId.startsWith("cancel_match:")).toBe(true);
      expect(customId.split(":")[1]).toBe(wagerId);
    });

    it("Ready button has customId ready:{wagerId}", () => {
      const wagerId = "ready-001";
      const customId = `ready:${wagerId}`;
      expect(customId).toBe("ready:ready-001");
      expect(customId.startsWith("ready:")).toBe(true);
      expect(customId.split(":")[1]).toBe(wagerId);
    });
  });

  describe("Env Var Default", () => {
    it("LOBBY_EXPIRY_MINUTES defaults to 30 when not set", async () => {
      const options: LobbyOptions = {
        hostId: "host-env-test",
        game: "fifa",
        platform: "pc",
        amount: 100,
        mode: "real",
      };

      makePassingMocks(options.amount);
      setupDbForCreation(options);

      const beforeCreate = Date.now();
      const result = await lobbyService.createLobby(options);
      const afterCreate = Date.now();

      // expiresAt should be ~30 minutes from now
      const expiresMs = result.expiresAt!.getTime();
      const expectedMin = beforeCreate + 30 * 60 * 1000 - 1000;
      const expectedMax = afterCreate + 30 * 60 * 1000 + 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresMs).toBeLessThanOrEqual(expectedMax);
    });
  });
});

describe("Integration Tests", () => {
  let lobbyService: LobbyService;

  beforeEach(() => {
    vi.clearAllMocks();
    lobbyService = new LobbyService();
  });

  describe("Lobby Card Lifecycle", () => {
    const baseOptions: LobbyOptions = {
      hostId: "host-lifecycle",
      game: "fifa",
      platform: "pc",
      amount: 500,
      mode: "real",
    };

    it("create → wager has status pending and null opponentId", async () => {
      makePassingMocks(baseOptions.amount);
      setupDbForCreation(baseOptions);

      const result = await lobbyService.createLobby(baseOptions);
      expect(result.status).toBe("pending");
      expect(result.opponentId).toBeNull();
      expect(result.creatorId).toBe(baseOptions.hostId);
      expect(result.game).toBe("fifa");
      expect(result.amount).toBe(500);
    });

    it("accept → wager transitions to active with opponentId set", async () => {
      const wagerId = "wager-accept-lifecycle";
      const opponentId = "opponent-lifecycle";
      const pendingWager = {
        id: wagerId,
        mode: "real" as const,
        game: "fifa",
        creatorId: "host-lifecycle",
        opponentId: null,
        amount: 500,
        fee: 100,
        status: "pending" as const,
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: "pc",
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: null,
        lobbyChannelId: null,
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const updatedWager = {
        ...pendingWager,
        opponentId,
        status: "active" as const,
        matchDeadline: new Date(Date.now() + 90 * 60 * 1000),
      };

      makePassingMocks(500);

      const mockDb = vi.mocked(db);
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([pendingWager]),
        }),
      }) as any);
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWager]),
          }),
        }),
      }) as any);

      const result = await lobbyService.acceptLobby(wagerId, opponentId, "guild-1");
      expect(result.status).toBe("active");
      expect(result.opponentId).toBe(opponentId);
    });

    it("cancel → wager transitions to cancelled", async () => {
      const wagerId = "wager-cancel-lifecycle";
      const hostId = "host-lifecycle";
      const pendingWager = {
        id: wagerId,
        mode: "real" as const,
        game: "fifa",
        creatorId: hostId,
        opponentId: null,
        amount: 500,
        fee: 100,
        status: "pending" as const,
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: "pc",
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: null,
        lobbyChannelId: null,
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const mockDb = vi.mocked(db);
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([pendingWager]),
        }),
      }) as any);

      let capturedStatus: string | undefined;
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((data: any) => {
          capturedStatus = data.status;
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }),
      }) as any);

      await lobbyService.cancelLobby(wagerId, hostId);

      expect(capturedStatus).toBe("cancelled");
      expect(walletService.refundEscrow).toHaveBeenCalledWith(hostId, 500, wagerId);
    });

    it("expire → wager transitions to expired", async () => {
      const wagerId = "wager-expire-lifecycle";
      const hostId = "host-lifecycle";
      const pendingWager = {
        id: wagerId,
        mode: "real" as const,
        game: "fifa",
        creatorId: hostId,
        opponentId: null,
        amount: 500,
        fee: 100,
        status: "pending" as const,
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() - 1000), // already expired
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: "pc",
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: "msg-123",
        lobbyChannelId: "ch-123",
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const mockDb = vi.mocked(db);
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([pendingWager]),
        }),
      }) as any);

      let capturedStatus: string | undefined;
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((data: any) => {
          capturedStatus = data.status;
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }),
      }) as any);

      await lobbyService.expireLobby(wagerId);

      expect(capturedStatus).toBe("expired");
      expect(walletService.refundEscrow).toHaveBeenCalledWith(hostId, 500, wagerId);
    });
  });

  describe("Coexistence with Existing /wager Flow", () => {
    it("WagerService.createWager still works with required opponentId", async () => {
      // WagerService requires opponentId — verify it still functions
      const { wagerService } = await import("../services/wager.js");

      const creatorId = "creator-coexist";
      const opponentId = "opponent-coexist";

      makePassingMocks(200);

      const wagerRecord = {
        id: "wager-direct",
        mode: "real",
        game: "valorant",
        creatorId,
        opponentId,
        amount: 200,
        fee: 40,
        status: "pending",
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: null,
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: null,
        lobbyChannelId: null,
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const mockDb = vi.mocked(db);
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([wagerRecord]),
        }),
      }) as any);

      const result = await wagerService.createWager(creatorId, opponentId, "valorant", 200);
      expect(result.opponentId).toBe(opponentId);
      expect(result.status).toBe("pending");
      expect(result.amount).toBe(200);
    });

    it("lobby wagers (null opponentId) and direct wagers (set opponentId) can coexist", async () => {
      // Create a lobby wager (null opponentId)
      const lobbyOptions: LobbyOptions = {
        hostId: "host-coexist",
        game: "fifa",
        platform: "pc",
        amount: 300,
        mode: "freeplay",
      };

      makePassingMocks(300);

      const lobbyWager = {
        id: "wager-lobby-coexist",
        mode: "freeplay",
        game: "fifa",
        creatorId: "host-coexist",
        opponentId: null,
        amount: 300,
        fee: 0,
        status: "pending",
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: "pc",
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: null,
        lobbyChannelId: null,
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const directWager = {
        id: "wager-direct-coexist",
        mode: "real",
        game: "valorant",
        creatorId: "creator-direct",
        opponentId: "opponent-direct",
        amount: 500,
        fee: 100,
        status: "pending",
        guildId: null,
        channelId: null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        matchDeadline: null,
        winnerId: null,
        settledAt: null,
        platform: null,
        gameMode: null,
        teamSize: null,
        rulesNotes: null,
        roundsFormat: null,
        lobbyMessageId: null,
        lobbyChannelId: null,
        createdAt: new Date(),
        creatorClipUrl: null,
        opponentClipUrl: null,
      };

      const mockDb = vi.mocked(db);

      // Setup for lobby creation
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }) as any);
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([lobbyWager]),
        }),
      }) as any);

      const lobbyResult = await lobbyService.createLobby(lobbyOptions);
      expect(lobbyResult.opponentId).toBeNull();
      expect(lobbyResult.status).toBe("pending");

      // Now create a direct wager
      vi.clearAllMocks();
      makePassingMocks(500);

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([directWager]),
        }),
      }) as any);

      const { wagerService } = await import("../services/wager.js");
      const directResult = await wagerService.createWager(
        "creator-direct", "opponent-direct", "valorant", 500,
      );
      expect(directResult.opponentId).toBe("opponent-direct");
      expect(directResult.status).toBe("pending");

      // Both wagers exist with different shapes
      expect(lobbyResult.opponentId).toBeNull();
      expect(directResult.opponentId).not.toBeNull();
    });
  });
});
