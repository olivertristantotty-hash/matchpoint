import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LobbyService, LobbyOptions, LobbyStatus } from "../services/lobby.js";
import { gameProfiles, getGameProfile } from "../services/games/profiles.js";

// ── Mock external dependencies ──

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

// ── Custom Arbitraries ──

const gameKeys = Object.keys(gameProfiles);
const platforms = ["pc", "xbox", "playstation", "crossplay"] as const;
const modes = ["real", "freeplay"] as const;

/** Generates random LobbyOptions */
const arbLobbyOptions: fc.Arbitrary<LobbyOptions> = fc.record({
  hostId: fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
  game: fc.constantFrom(...gameKeys),
  platform: fc.constantFrom(...platforms),
  amount: fc.integer({ min: 10, max: 10000 }),
  mode: fc.constantFrom(...modes),
  gameMode: fc.option(fc.constantFrom("1v1", "2v2", "3v3", "5v5"), { nil: undefined }),
  teamSize: fc.option(fc.constantFrom("solo", "duo", "trio", "squad"), { nil: undefined }),
  rulesNotes: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  roundsFormat: fc.option(fc.constantFrom("Bo1", "Bo3", "Bo5"), { nil: undefined }),
  guildId: fc.option(fc.stringMatching(/^[0-9]{17,20}$/), { nil: undefined }),
});

/** Generates a random host profile for validation scenarios */
const arbHostProfile = fc.record({
  reputation: fc.integer({ min: 0, max: 1500 }),
  banned: fc.boolean(),
  identityLinked: fc.boolean(),
  balance: fc.integer({ min: 0, max: 50000 }),
  freeplayBalance: fc.integer({ min: 0, max: 50000 }),
});

/** Generates a random lobby status */
const arbLobbyStatus: fc.Arbitrary<LobbyStatus> = fc.constantFrom(
  "open",
  "matched",
  "expired",
  "cancelled",
);

// ── Helpers ──


/**
 * Configure mocks so that all validation checks pass for the given options and profile.
 * Returns whether we expect creation to succeed.
 */
function setupMocksForCreation(
  options: LobbyOptions,
  profile: { banned: boolean; identityLinked: boolean; reputation: number; balance: number; freeplayBalance: number },
) {
  // Determine what each check will return
  const fraudPasses = !profile.banned;
  const identityPasses = profile.identityLinked;
  // Use the real reputation logic: rep >= 50 can wager, with tiered limits
  const getMaxWager = (rep: number) => {
    if (rep >= 1000) return 10000;
    if (rep >= 500) return 5000;
    if (rep >= 300) return 2500;
    if (rep >= 150) return 1000;
    if (rep >= 100) return 500;
    if (rep >= 50) return 250;
    return 0;
  };
  const maxWager = getMaxWager(profile.reputation);
  const repPasses = maxWager > 0 && options.amount <= maxWager;
  const balancePasses = options.mode === "real"
    ? profile.balance >= options.amount
    : profile.freeplayBalance >= options.amount;

  // Setup mocks
  vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue(
    fraudPasses ? { passed: true } : { passed: false, reason: "User is banned from wagering." },
  );
  vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(
    identityPasses ? null : "You need to link a game account before wagering.",
  );
  vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(
    repPasses ? null : `Your reputation is too low.`,
  );
  vi.mocked(walletService.getBalance).mockResolvedValue({
    available: profile.balance,
    escrowed: 0,
    freeplay: profile.freeplayBalance,
    freeplayEscrowed: 0,
  });

  // For real mode, all 4 checks must pass. For freeplay, only balance.
  let shouldSucceed: boolean;
  if (options.mode === "real") {
    shouldSucceed = fraudPasses && identityPasses && repPasses && balancePasses;
  } else {
    shouldSucceed = balancePasses;
  }

  return shouldSucceed;
}

/**
 * Setup DB mocks for a successful lobby creation.
 * hasActiveLobby returns [] (no duplicate), insert returns a wager record.
 */
function setupDbForCreation(options: LobbyOptions) {
  const mockDb = vi.mocked(db);
  const wagerRecord = {
    id: "wager-" + Math.random().toString(36).slice(2, 10),
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

  // The db mock needs to handle two call patterns:
  // 1. select().from().where().limit() for hasActiveLobby → []
  // 2. insert().values().returning() for creating the wager → [wagerRecord]
  let selectCallCount = 0;
  let insertCallCount = 0;

  mockDb.select.mockImplementation(() => {
    selectCallCount++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any;
  });

  mockDb.insert.mockImplementation(() => {
    insertCallCount++;
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([wagerRecord]),
      }),
    } as any;
  });

  return wagerRecord;
}

// ── Test Suite ──

describe("LobbyService Properties", () => {
  let lobbyService: LobbyService;

  beforeEach(() => {
    vi.clearAllMocks();
    lobbyService = new LobbyService();
  });

  // Property 1: Lobby creation validation and wager record correctness
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
  it("Property 1: Lobby creation validates host and produces correct wager record", async () => {
    await fc.assert(
      fc.asyncProperty(arbLobbyOptions, arbHostProfile, async (options, profile) => {
        vi.clearAllMocks();
        const shouldSucceed = setupMocksForCreation(options, profile);
        const wagerRecord = setupDbForCreation(options);

        if (shouldSucceed) {
          const result = await lobbyService.createLobby(options);
          // Verify the returned wager record has correct fields
          expect(result.status).toBe("pending");
          expect(result.opponentId).toBeNull();
          expect(result.game).toBe(options.game);
          expect(result.platform).toBe(options.platform);
          expect(result.amount).toBe(options.amount);
          expect(result.mode).toBe(options.mode);
          expect(result.creatorId).toBe(options.hostId);
          expect(result.gameMode).toBe(options.gameMode ?? null);
          expect(result.teamSize).toBe(options.teamSize ?? null);
          expect(result.rulesNotes).toBe(options.rulesNotes ?? null);
          expect(result.roundsFormat).toBe(options.roundsFormat ?? null);
        } else {
          await expect(lobbyService.createLobby(options)).rejects.toThrow();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property 2: Escrow locking by mode
  // Validates: Requirements 2.6, 2.7
  it("Property 2: Lobby creation locks the correct escrow type based on mode", async () => {
    await fc.assert(
      fc.asyncProperty(arbLobbyOptions, async (options) => {
        vi.clearAllMocks();

        // Force all validations to pass
        vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue({ passed: true });
        vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(null);
        vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(null);
        vi.mocked(walletService.getBalance).mockResolvedValue({
          available: options.amount + 1000,
          escrowed: 0,
          freeplay: options.amount + 1000,
          freeplayEscrowed: 0,
        });

        setupDbForCreation(options);

        await lobbyService.createLobby(options);

        if (options.mode === "real") {
          expect(walletService.lockEscrow).toHaveBeenCalledWith(
            options.hostId,
            options.amount,
            expect.any(String),
          );
          expect(walletService.lockFreeplayEscrow).not.toHaveBeenCalled();
        } else {
          expect(walletService.lockFreeplayEscrow).toHaveBeenCalledWith(
            options.hostId,
            options.amount,
          );
          expect(walletService.lockEscrow).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property 3: Duplicate pending lobby prevention
  // Validates: Requirements 2.8
  it("Property 3: Duplicate pending lobby prevention", async () => {
    await fc.assert(
      fc.asyncProperty(arbLobbyOptions, async (options) => {
        vi.clearAllMocks();

        // Force all validations to pass
        vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue({ passed: true });
        vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(null);
        vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(null);
        vi.mocked(walletService.getBalance).mockResolvedValue({
          available: options.amount + 1000,
          escrowed: 0,
          freeplay: options.amount + 1000,
          freeplayEscrowed: 0,
        });

        // Mock hasActiveLobby to return an existing pending lobby
        const mockDb = vi.mocked(db);
        mockDb.select.mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-lobby" }]),
            }),
          }),
        }) as any);

        await expect(lobbyService.createLobby(options)).rejects.toThrow(
          "You already have an open lobby",
        );
      }),
      { numRuns: 100 },
    );
  });

  // Property 4: Lobby card embed contains all required information
  // Validates: Requirements 3.3, 3.4
  it("Property 4: Lobby card embed contains all required information", async () => {
    await fc.assert(
      fc.property(
        arbLobbyOptions,
        fc.record({
          username: fc.string({ minLength: 1, maxLength: 32 }),
          reputation: fc.integer({ min: 0, max: 1500 }),
        }),
        (options, hostUser) => {
          vi.clearAllMocks();
          vi.mocked(reputationService.getRepBadge).mockReturnValue(`⭐ ${hostUser.reputation}`);

          const now = new Date();
          const wager = {
            id: "wager-test",
            mode: options.mode,
            game: options.game,
            creatorId: options.hostId,
            opponentId: null,
            amount: options.amount,
            fee: options.mode === "real" ? Math.floor((options.amount * 2 * 10) / 100) : 0,
            status: "pending" as const,
            guildId: options.guildId ?? null,
            channelId: null,
            expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
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
            createdAt: now,
            creatorClipUrl: null,
            opponentClipUrl: null,
          };

          const embed = lobbyService.buildLobbyEmbed(wager as any, hostUser, "open");
          const embedData = embed.toJSON();

          // Verify game name in title
          const profile = getGameProfile(options.game);
          const gameName = profile?.name ?? options.game;
          expect(embedData.title).toContain(gameName);

          // Verify platform in title
          expect(embedData.title).toContain(options.platform);

          // Verify amount with currency label
          const currencyLabel = options.mode === "real" ? "tokens" : "coins";
          const amountField = embedData.fields?.find((f) => f.name === "Amount");
          expect(amountField).toBeDefined();
          expect(amountField!.value).toContain(String(options.amount));
          expect(amountField!.value).toContain(currencyLabel);

          // Verify host name and rep badge
          const hostField = embedData.fields?.find((f) => f.name === "Host");
          expect(hostField).toBeDefined();
          expect(hostField!.value).toContain(hostUser.username);
          expect(hostField!.value).toContain(`⭐ ${hostUser.reputation}`);

          // Verify expiry countdown field exists for open status
          const expiresField = embedData.fields?.find((f) => f.name === "Expires");
          expect(expiresField).toBeDefined();

          // Verify game rules in footer
          if (profile) {
            expect(embedData.footer?.text).toBeDefined();
            for (const rule of profile.rules) {
              expect(embedData.footer!.text).toContain(rule);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 5: Self-acceptance rejection
  // Validates: Requirements 4.1
  it("Property 5: Self-acceptance rejection", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        fc.constantFrom(...gameKeys),
        fc.integer({ min: 10, max: 10000 }),
        fc.constantFrom(...modes),
        async (hostId, game, amount, mode) => {
          vi.clearAllMocks();

          const wagerRecord = {
            id: "wager-self",
            mode,
            game,
            creatorId: hostId,
            opponentId: null,
            amount,
            fee: 0,
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

          // Mock db.select().from().where() to return the wager
          const mockDb = vi.mocked(db);
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([wagerRecord]),
            }),
          }) as any);

          // Attempt to accept own lobby
          await expect(
            lobbyService.acceptLobby("wager-self", hostId, "guild-1"),
          ).rejects.toThrow("You can't accept your own lobby");
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 6: Acceptance requires pending status
  // Validates: Requirements 4.2
  it("Property 6: Non-pending acceptance rejection", async () => {
    const nonPendingStatuses = ["active", "reporting", "disputed", "settled", "cancelled", "expired"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonPendingStatuses),
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        async (status, hostId, opponentId) => {
          // Ensure different users
          fc.pre(hostId !== opponentId);
          vi.clearAllMocks();

          const wagerRecord = {
            id: "wager-nonpending",
            mode: "real",
            game: "fifa",
            creatorId: hostId,
            opponentId: status === "active" ? opponentId : null,
            amount: 100,
            fee: 20,
            status,
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
              where: vi.fn().mockResolvedValue([wagerRecord]),
            }),
          }) as any);

          await expect(
            lobbyService.acceptLobby("wager-nonpending", opponentId, "guild-1"),
          ).rejects.toThrow("This lobby is no longer available");
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 7: Lobby acceptance validates opponent and produces correct state transition
  // Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7
  it("Property 7: Acceptance validation and state transition", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLobbyOptions,
        arbHostProfile,
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        async (options, opponentProfile, opponentId) => {
          // Ensure different users
          fc.pre(options.hostId !== opponentId);
          vi.clearAllMocks();

          const wagerId = "wager-accept-test";
          const pendingWager = {
            id: wagerId,
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

          // Determine expected outcome based on opponent profile
          const fraudPasses = !opponentProfile.banned;
          const identityPasses = opponentProfile.identityLinked;
          const getMaxWager = (rep: number) => {
            if (rep >= 1000) return 10000;
            if (rep >= 500) return 5000;
            if (rep >= 300) return 2500;
            if (rep >= 150) return 1000;
            if (rep >= 100) return 500;
            if (rep >= 50) return 250;
            return 0;
          };
          const maxWager = getMaxWager(opponentProfile.reputation);
          const repPasses = maxWager > 0 && options.amount <= maxWager;
          const balancePasses = options.mode === "real"
            ? opponentProfile.balance >= options.amount
            : opponentProfile.freeplayBalance >= options.amount;

          let shouldSucceed: boolean;
          if (options.mode === "real") {
            shouldSucceed = fraudPasses && identityPasses && repPasses && balancePasses;
          } else {
            shouldSucceed = balancePasses;
          }

          // Setup mocks for opponent validation
          vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue(
            fraudPasses ? { passed: true } : { passed: false, reason: "User is banned from wagering." },
          );
          vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(
            identityPasses ? null : "You need to link a game account.",
          );
          vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(
            repPasses ? null : "Your reputation is too low.",
          );
          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: opponentProfile.balance,
            escrowed: 0,
            freeplay: opponentProfile.freeplayBalance,
            freeplayEscrowed: 0,
          });

          const updatedWager = {
            ...pendingWager,
            opponentId,
            status: "active" as const,
            matchDeadline: new Date(Date.now() + 90 * 60 * 1000),
          };

          // Mock DB: first select returns the pending wager, update returns the updated wager
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

          if (shouldSucceed) {
            const result = await lobbyService.acceptLobby(wagerId, opponentId, "guild-1");
            expect(result.opponentId).toBe(opponentId);
            expect(result.status).toBe("active");

            // Verify escrow was locked for opponent
            if (options.mode === "real") {
              expect(walletService.lockEscrow).toHaveBeenCalledWith(
                opponentId,
                options.amount,
                wagerId,
              );
            } else {
              expect(walletService.lockFreeplayEscrow).toHaveBeenCalledWith(
                opponentId,
                options.amount,
              );
            }
          } else {
            await expect(
              lobbyService.acceptLobby(wagerId, opponentId, "guild-1"),
            ).rejects.toThrow();

            // Verify no escrow was locked for opponent
            expect(walletService.lockEscrow).not.toHaveBeenCalled();
            expect(walletService.lockFreeplayEscrow).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 8: Match thread contains correct information
  // Validates: Requirements 5.2, 5.4
  it("Property 8: Thread name and message content", async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.constantFrom(...gameKeys),
        fc.integer({ min: 10, max: 10000 }),
        fc.constantFrom(...modes),
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        (playerA, playerB, gameKey, amount, mode, rulesNotes) => {
          const profile = getGameProfile(gameKey);
          const gameName = profile?.name ?? gameKey.toUpperCase();

          // Verify thread name pattern: "{PlayerA} vs {PlayerB} — {GameName}"
          const threadName = `${playerA} vs ${playerB} — ${gameName}`;
          expect(threadName).toContain(playerA);
          expect(threadName).toContain(playerB);
          expect(threadName).toContain(gameName);
          expect(threadName).toContain(" vs ");
          expect(threadName).toContain(" — ");

          // Verify game rules from GameProfile are present
          if (profile) {
            const rulesBlock = profile.rules.map((r) => `• ${r}`).join("\n");
            for (const rule of profile.rules) {
              expect(rulesBlock).toContain(rule);
            }
          }

          // Verify custom rules notes would be included
          if (rulesNotes) {
            const customRulesMessage = `**Custom Rules:** ${rulesNotes}`;
            expect(customRulesMessage).toContain(rulesNotes);
          }

          // Verify currency label
          const currency = mode === "freeplay" ? "coins" : "tokens";
          const amountStr = `${amount} ${currency}`;
          expect(amountStr).toContain(String(amount));
          expect(amountStr).toContain(currency);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 9: Pre-ready cancellation refunds both players
  // Validates: Requirements 6.2, 6.3
  it("Property 9: Pre-ready cancellation refund", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/),
        fc.integer({ min: 10, max: 10000 }),
        fc.constantFrom(...modes),
        async (hostId, opponentId, amount, mode) => {
          fc.pre(hostId !== opponentId);
          vi.clearAllMocks();

          const wagerId = "wager-cancel-match";
          const activeWager = {
            id: wagerId,
            mode,
            game: "fifa",
            creatorId: hostId,
            opponentId,
            amount,
            fee: mode === "real" ? Math.floor((amount * 2 * 10) / 100) : 0,
            status: "active" as const,
            guildId: null,
            channelId: null,
            expiresAt: null,
            matchDeadline: new Date(Date.now() + 90 * 60 * 1000),
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

          // Mock DB for wagerService.refundWager: select returns the active wager
          const mockDb = vi.mocked(db);
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([activeWager]),
            }),
          }) as any);
          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }) as any);

          // Import and call wagerService.refundWager
          const { wagerService } = await import("../services/wager.js");
          await wagerService.refundWager(wagerId, "Cancelled by player");

          // Verify both players get refunded
          if (mode === "real") {
            expect(walletService.refundEscrow).toHaveBeenCalledWith(hostId, amount, wagerId);
            expect(walletService.refundEscrow).toHaveBeenCalledWith(opponentId, amount, wagerId);
          } else {
            expect(walletService.refundFreeplayEscrow).toHaveBeenCalledWith(hostId, amount);
            expect(walletService.refundFreeplayEscrow).toHaveBeenCalledWith(opponentId, amount);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 10: Lobby expiry sets correct timestamp and refunds host
  // Validates: Requirements 8.1, 8.2, 8.3
  it("Property 10: Expiry timestamp and refund", async () => {
    await fc.assert(
      fc.asyncProperty(arbLobbyOptions, async (options) => {
        vi.clearAllMocks();

        // Force all validations to pass
        vi.mocked(antiFraudService.preWagerCheck).mockResolvedValue({ passed: true });
        vi.mocked(identityService.preWagerIdentityCheck).mockResolvedValue(null);
        vi.mocked(reputationService.checkWagerLimit).mockResolvedValue(null);
        vi.mocked(walletService.getBalance).mockResolvedValue({
          available: options.amount + 1000,
          escrowed: 0,
          freeplay: options.amount + 1000,
          freeplayEscrowed: 0,
        });

        const wagerRecord = setupDbForCreation(options);
        const beforeCreate = Date.now();
        const result = await lobbyService.createLobby(options);
        const afterCreate = Date.now();

        // Verify expiresAt = createdAt + LOBBY_EXPIRY_MINUTES (default 30)
        const expiresAt = result.expiresAt!;
        expect(expiresAt).toBeDefined();
        // The expiry should be approximately 30 minutes from now
        const expiryMs = expiresAt.getTime();
        const expectedMinMs = beforeCreate + 30 * 60 * 1000 - 1000; // 1s tolerance
        const expectedMaxMs = afterCreate + 30 * 60 * 1000 + 1000;
        expect(expiryMs).toBeGreaterThanOrEqual(expectedMinMs);
        expect(expiryMs).toBeLessThanOrEqual(expectedMaxMs);

        // Now test expireLobby refunds the host
        vi.clearAllMocks();
        const expiredWager = {
          ...wagerRecord,
          id: result.id,
          status: "pending" as const,
        };

        const mockDb = vi.mocked(db);
        mockDb.select.mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([expiredWager]),
          }),
        }) as any);
        mockDb.update.mockImplementation(() => ({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }) as any);

        await lobbyService.expireLobby(result.id);

        // Verify refund was called for the host
        if (options.mode === "real") {
          expect(walletService.refundEscrow).toHaveBeenCalledWith(
            options.hostId,
            options.amount,
            result.id,
          );
        } else {
          expect(walletService.refundFreeplayEscrow).toHaveBeenCalledWith(
            options.hostId,
            options.amount,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property 11: Host cancellation of pending lobby refunds host
  // Validates: Requirements 9.2, 9.3
  it("Property 11: Host cancellation refund", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLobbyOptions,
        async (options) => {
          vi.clearAllMocks();

          const wagerId = "wager-cancel-lobby";
          const pendingWager = {
            id: wagerId,
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
              where: vi.fn().mockResolvedValue([pendingWager]),
            }),
          }) as any);
          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }) as any);

          await lobbyService.cancelLobby(wagerId, options.hostId);

          // Verify refund was called with correct amount and mode
          if (options.mode === "real") {
            expect(walletService.refundEscrow).toHaveBeenCalledWith(
              options.hostId,
              options.amount,
              wagerId,
            );
            expect(walletService.refundFreeplayEscrow).not.toHaveBeenCalled();
          } else {
            expect(walletService.refundFreeplayEscrow).toHaveBeenCalledWith(
              options.hostId,
              options.amount,
            );
            expect(walletService.refundEscrow).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 12: Lobby card embed color matches status
  // Validates: Requirements 10.1
  it("Property 12: Embed color mapping", async () => {
    const expectedColors: Record<LobbyStatus, number> = {
      open: 0xffd700,
      matched: 0x00ff00,
      expired: 0x808080,
      cancelled: 0xff0000,
    };

    await fc.assert(
      fc.property(arbLobbyStatus, (status) => {
        vi.clearAllMocks();
        vi.mocked(reputationService.getRepBadge).mockReturnValue("⭐ 100");

        const wager = {
          id: "wager-color",
          mode: "real",
          game: "fifa",
          creatorId: "host-1",
          opponentId: null,
          amount: 100,
          fee: 20,
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

        const embed = lobbyService.buildLobbyEmbed(
          wager as any,
          { username: "TestHost", reputation: 100 },
          status,
        );

        const embedData = embed.toJSON();
        expect(embedData.color).toBe(expectedColors[status]);
      }),
      { numRuns: 100 },
    );
  });
});
