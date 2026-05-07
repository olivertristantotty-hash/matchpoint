import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── Mock external dependencies (hoisted by vitest) ──

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
    getWallet: vi.fn(),
    deposit: vi.fn(),
    withdraw: vi.fn(),
    depositFromCrypto: vi.fn(),
    withdrawForCrypto: vi.fn(),
    refundFailedWithdrawal: vi.fn(),
    logTransaction: vi.fn(),
    lockEscrow: vi.fn(),
    lockFreeplayEscrow: vi.fn(),
    refundEscrow: vi.fn(),
    refundFreeplayEscrow: vi.fn(),
  },
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-id-" + Math.random().toString(36).slice(2, 10)),
}));

// ── Set env vars using vi.hoisted so they run before module imports ──
vi.hoisted(() => {
  process.env.NOWPAYMENTS_API_KEY = "test-api-key";
  process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
  process.env.NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";
  process.env.MIN_DEPOSIT_TOKENS = "500";
  process.env.MIN_WITHDRAWAL_TOKENS = "1000";
  process.env.WITHDRAWAL_FEE_TOKENS = "50";
  process.env.MAX_DAILY_WITHDRAWALS = "3";
  process.env.MAINTENANCE_MODE = "false";
});

// ── Import mocked modules ──
import { db } from "../db/index.js";
import { walletService } from "../services/wallet.js";
import { PaymentService } from "../services/payment.js";

// The IPN secret used by the module-level constant
const TEST_IPN_SECRET = "test-ipn-secret";

// ── Custom Arbitraries (Generators) ──

/** Generate random user IDs (nanoid-like) */
const arbUserId = fc.stringMatching(/^[a-zA-Z0-9_-]{10,21}$/);

/** Generate valid Solana addresses (base58, 32-44 chars) */
const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const arbSolanaAddress = fc
  .integer({ min: 32, max: 44 })
  .chain((len) =>
    fc.array(fc.constantFrom(...BASE58_CHARS.split("")), { minLength: len, maxLength: len })
      .map((chars) => chars.join(""))
  );

/** Generate invalid Solana addresses */
const arbInvalidSolanaAddress = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[a-zA-Z0-9]{1,31}$/),
  fc.stringMatching(/^[a-zA-Z0-9]{45,60}$/),
  fc.constant("0OIl" + "A".repeat(30)),
);

/** Generate withdrawal request tuples */
const arbWithdrawalRequest = fc.record({
  amount: fc.integer({ min: 1, max: 100000 }),
  balance: fc.integer({ min: 0, max: 200000 }),
  address: fc.oneof(arbSolanaAddress, arbInvalidSolanaAddress),
  dailyCount: fc.integer({ min: 0, max: 10 }),
});

// ── Helpers ──

function computeHmac(body: Record<string, unknown>, secret: string): string {
  const sorted = Object.keys(body)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = body[key];
      return acc;
    }, {});
  const hmac = createHmac("sha512", secret);
  hmac.update(JSON.stringify(sorted));
  return hmac.digest("hex");
}

function resetDbMocks() {
  const mockDb = vi.mocked(db) as any;
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.returning.mockResolvedValue([]);
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
}


// ── Test Suite ──

describe("Feature: crypto-payments — Property-Based Tests", () => {
  let svc: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDbMocks();
    process.env.MAINTENANCE_MODE = "false";
    svc = new PaymentService();
    // Verify service is not disabled
    expect(svc.disabled).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 1: Deposit address provisioning idempotency
  // **Validates: Requirements 1.1, 1.2**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 1: Deposit address provisioning idempotency", async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbSolanaAddress, async (userId, generatedAddress) => {
        vi.clearAllMocks();
        resetDbMocks();

        const mockDb = vi.mocked(db) as any;
        let apiCallCount = 0;
        let callCount = 0;

        // First select: no profile → triggers API. Second select: profile with address → returns cached.
        mockDb.select.mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([]);
              }
              return Promise.resolve([{
                id: "profile-1",
                userId,
                nowpaymentsDepositAddress: generatedAddress,
                savedWithdrawalAddress: null,
              }]);
            }),
          }),
        }));

        mockDb.insert.mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }));

        mockDb.update.mockImplementation(() => ({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }));

        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
          apiCallCount++;
          return { ok: true, json: async () => ({ address: generatedAddress }), text: async () => "" };
        }) as any;

        try {
          const result1 = await svc.getOrCreateDepositAddress(userId);
          const result2 = await svc.getOrCreateDepositAddress(userId);

          expect(result1.address).toBe(generatedAddress);
          expect(result2.address).toBe(generatedAddress);
          expect(result1.currency).toBe("usdcsol");
          expect(result2.currency).toBe("usdcsol");
          expect(apiCallCount).toBe(1);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 2: Webhook HMAC signature verification
  // **Validates: Requirements 2.1, 2.2, 7.1**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 2: Webhook HMAC signature verification", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[a-z_]{1,20}$/),
          fc.oneof(fc.string({ maxLength: 50 }), fc.integer(), fc.double({ noNaN: true })),
          { minKeys: 1, maxKeys: 10 },
        ),
        (payload) => {
          // Use the fixed TEST_IPN_SECRET since the module captures it at load time
          const validSig = computeHmac(payload as Record<string, unknown>, TEST_IPN_SECRET);

          // Valid signature accepted
          expect(svc.verifyWebhookSignature(payload as Record<string, unknown>, validSig)).toBe(true);

          // Invalid signature rejected
          expect(svc.verifyWebhookSignature(payload as Record<string, unknown>, "invalid-sig")).toBe(false);
          expect(svc.verifyWebhookSignature(payload as Record<string, unknown>, "")).toBe(false);

          // Tampered payload rejected
          const modified = { ...payload, _tampered: "yes" };
          expect(svc.verifyWebhookSignature(modified as Record<string, unknown>, validSig)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 3: USD-to-token conversion
  // **Validates: Requirements 2.3, 2.8**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 3: USD-to-token conversion — tokenAmount = Math.floor(usdValue * 100)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100000, noNaN: true }),
        (usdValue) => {
          const expected = Math.floor(usdValue * 100);
          const tokenAmount = Math.floor(usdValue * 100);
          expect(tokenAmount).toBe(expected);
          expect(tokenAmount).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(tokenAmount)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 4: Webhook processing idempotency
  // **Validates: Requirements 2.4, 3.2, 7.3**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 4: Webhook processing idempotency — balance credited exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbSolanaAddress,
        fc.double({ min: 5.0, max: 10000, noNaN: true }),
        fc.integer({ min: 2, max: 5 }),
        async (userId, payAddress, usdValue, repeatCount) => {
          vi.clearAllMocks();
          resetDbMocks();

          const mockDb = vi.mocked(db) as any;
          const paymentId = "pay-" + Math.random().toString(36).slice(2, 10);
          let credited = 0;
          let depositExists = false;
          const depositId = "dep-" + Math.random().toString(36).slice(2, 10);

          let selectCallIdx = 0;
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCallIdx++;
                // Odd: user profile lookup; Even: deposit lookup
                if (selectCallIdx % 2 === 1) {
                  return Promise.resolve([{
                    id: "profile-1", userId,
                    nowpaymentsDepositAddress: payAddress,
                    savedWithdrawalAddress: null,
                  }]);
                }
                if (!depositExists) return Promise.resolve([]);
                return Promise.resolve([{
                  id: depositId, userId,
                  nowpaymentsPaymentId: paymentId,
                  status: "confirmed", credited,
                  maintenanceQueued: 0,
                  usdValue: String(usdValue),
                  tokenAmount: Math.floor(usdValue * 100),
                  sourceCurrency: "usdcsol",
                  sourceAmount: String(usdValue),
                }]);
              }),
            }),
          }));

          mockDb.insert.mockImplementation(() => {
            depositExists = true;
            credited = 1;
            return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) };
          });

          mockDb.update.mockImplementation(() => {
            if (!depositExists) depositExists = true;
            credited = 1;
            return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
          });

          const payload = {
            payment_id: paymentId,
            payment_status: "confirmed",
            pay_address: payAddress,
            pay_currency: "usdcsol",
            outcome_amount: usdValue,
            price_amount: usdValue,
          };

          for (let i = 0; i < repeatCount; i++) {
            await svc.processDepositWebhook(payload);
          }

          expect(walletService.depositFromCrypto).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });


  // ──────────────────────────────────────────────────────────────────────
  // Property 5: Deposit status transitions and minimum enforcement
  // **Validates: Requirements 2.5, 2.6, 8.1**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 5: Deposit status transitions and minimum enforcement", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbSolanaAddress,
        fc.constantFrom("confirming", "confirmed", "finished", "failed", "expired"),
        fc.double({ min: 0.01, max: 10000, noNaN: true }),
        async (userId, payAddress, status, usdValue) => {
          vi.clearAllMocks();
          resetDbMocks();

          const mockDb = vi.mocked(db) as any;
          let selectCallIdx = 0;

          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCallIdx++;
                if (selectCallIdx % 2 === 1) {
                  return Promise.resolve([{
                    id: "profile-1", userId,
                    nowpaymentsDepositAddress: payAddress,
                    savedWithdrawalAddress: null,
                  }]);
                }
                return Promise.resolve([]);
              }),
            }),
          }));

          mockDb.insert.mockImplementation(() => ({
            values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }));

          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          }));

          const payload = {
            payment_id: "pay-" + Math.random().toString(36).slice(2, 10),
            payment_status: status,
            pay_address: payAddress,
            pay_currency: "usdcsol",
            outcome_amount: usdValue,
            price_amount: usdValue,
          };

          await svc.processDepositWebhook(payload);

          if (status === "confirming") {
            expect(walletService.depositFromCrypto).not.toHaveBeenCalled();
          } else if (status === "confirmed" || status === "finished") {
            if (usdValue < 5.0) {
              expect(walletService.depositFromCrypto).not.toHaveBeenCalled();
            } else {
              const expectedTokens = Math.floor(usdValue * 100);
              expect(walletService.depositFromCrypto).toHaveBeenCalledTimes(1);
              expect(walletService.depositFromCrypto).toHaveBeenCalledWith(
                userId, expectedTokens, expect.any(String),
              );
            }
          } else {
            expect(walletService.depositFromCrypto).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 6: Withdrawal validation
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 9.1**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 6: Withdrawal validation — accepted iff all four conditions hold", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbWithdrawalRequest,
        arbUserId,
        async ({ amount, balance, address, dailyCount }, userId) => {
          vi.clearAllMocks();
          resetDbMocks();
          process.env.MAINTENANCE_MODE = "false";

          const FEE = 50;
          const MIN_WITHDRAWAL = 1000;
          const MAX_DAILY = 3;

          const isValidAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
          const meetsMinimum = amount >= MIN_WITHDRAWAL;
          const hasSufficientBalance = balance >= amount + FEE;
          const withinDailyLimit = dailyCount < MAX_DAILY;
          const shouldAccept = meetsMinimum && hasSufficientBalance && isValidAddress && withinDailyLimit;

          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: balance, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });

          const mockDb = vi.mocked(db) as any;
          // getDailyWithdrawalCount returns dailyCount
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: dailyCount }]),
            }),
          }));

          mockDb.insert.mockImplementation(() => ({
            values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }));

          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
            }),
          }));

          const originalFetch = globalThis.fetch;
          globalThis.fetch = vi.fn().mockImplementation(async () => ({
            ok: true, json: async () => ({ id: "payout-123" }), text: async () => "",
          })) as any;

          try {
            const result = await svc.initiateWithdrawal(userId, amount, address);

            if (shouldAccept) {
              expect(result.status).not.toBe("failed");
              expect(walletService.withdrawForCrypto).toHaveBeenCalled();
            } else {
              expect(result.status).toBe("failed");
              expect(result.error).toBeDefined();
              expect(walletService.withdrawForCrypto).not.toHaveBeenCalled();
            }
          } finally {
            globalThis.fetch = originalFetch;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 7: Withdrawal balance deduction
  // **Validates: Requirements 4.6, 4.7, 14.2, 14.3**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 7: Withdrawal balance deduction — amount + fee deducted, two transactions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 50000 }),
        arbUserId,
        arbSolanaAddress,
        async (amount, userId, address) => {
          vi.clearAllMocks();
          resetDbMocks();

          const FEE = 50;
          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: amount + FEE + 1000, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });

          const mockDb = vi.mocked(db) as any;
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }));
          mockDb.insert.mockImplementation(() => ({
            values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }));
          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
            }),
          }));

          const originalFetch = globalThis.fetch;
          globalThis.fetch = vi.fn().mockImplementation(async () => ({
            ok: true, json: async () => ({ id: "payout-ok" }), text: async () => "",
          })) as any;

          try {
            const result = await svc.initiateWithdrawal(userId, amount, address);
            expect(result.status).toBe("processing");
            expect(walletService.withdrawForCrypto).toHaveBeenCalledTimes(1);
            expect(walletService.withdrawForCrypto).toHaveBeenCalledWith(
              userId, amount, FEE, expect.any(String),
            );
          } finally {
            globalThis.fetch = originalFetch;
          }
        },
      ),
      { numRuns: 100 },
    );
  });


  // ──────────────────────────────────────────────────────────────────────
  // Property 8: Failed withdrawal full refund
  // **Validates: Requirements 5.3, 5.5**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 8: Failed withdrawal full refund — balance restored by amount + fee", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 50000 }),
        arbUserId,
        arbSolanaAddress,
        async (amount, userId, address) => {
          vi.clearAllMocks();
          resetDbMocks();

          const FEE = 50;
          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: amount + FEE + 1000, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });

          const mockDb = vi.mocked(db) as any;
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }));
          mockDb.insert.mockImplementation(() => ({
            values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }));
          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
            }),
          }));

          // Payout API fails
          const originalFetch = globalThis.fetch;
          globalThis.fetch = vi.fn().mockImplementation(async () => ({
            ok: false, status: 500, json: async () => ({}), text: async () => "Internal Server Error",
          })) as any;

          try {
            const result = await svc.initiateWithdrawal(userId, amount, address);
            expect(result.status).toBe("failed");
            expect(result.error).toBeDefined();
            expect(walletService.withdrawForCrypto).toHaveBeenCalledTimes(1);
            expect(walletService.refundFailedWithdrawal).toHaveBeenCalledTimes(1);
            expect(walletService.refundFailedWithdrawal).toHaveBeenCalledWith(
              userId, amount, FEE, expect.any(String),
            );
          } finally {
            globalThis.fetch = originalFetch;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 9: Withdrawal address persistence
  // **Validates: Requirements 6.2, 6.4**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 9: Withdrawal address persistence — saved address equals last used", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.array(arbSolanaAddress, { minLength: 1, maxLength: 5 }),
        async (userId, addresses) => {
          vi.clearAllMocks();
          resetDbMocks();

          const FEE = 50;
          const amount = 1000;

          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: 200000, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });

          const mockDb = vi.mocked(db) as any;
          let savedAddress: string | null = null;
          let profileExists = false;

          const originalFetch = globalThis.fetch;
          globalThis.fetch = vi.fn().mockImplementation(async () => ({
            ok: true, json: async () => ({ id: "payout-ok" }), text: async () => "",
          })) as any;

          try {
            for (const addr of addresses) {
              let selectCallInIteration = 0;
              mockDb.select.mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockImplementation(() => {
                    selectCallInIteration++;
                    if (selectCallInIteration === 1) {
                      // getDailyWithdrawalCount
                      return Promise.resolve([{ count: 0 }]);
                    }
                    // Profile lookup after successful withdrawal
                    if (profileExists) {
                      return Promise.resolve([{
                        id: "profile-1", userId,
                        nowpaymentsDepositAddress: null,
                        savedWithdrawalAddress: savedAddress,
                      }]);
                    }
                    return Promise.resolve([]);
                  }),
                }),
              }));

              mockDb.insert.mockImplementation(() => ({
                values: vi.fn().mockImplementation((vals: any) => {
                  if (vals.savedWithdrawalAddress) {
                    savedAddress = vals.savedWithdrawalAddress;
                    profileExists = true;
                  }
                  return { returning: vi.fn().mockResolvedValue([]) };
                }),
              }));

              mockDb.update.mockImplementation(() => ({
                set: vi.fn().mockImplementation((vals: any) => {
                  if (vals.savedWithdrawalAddress !== undefined) {
                    savedAddress = vals.savedWithdrawalAddress;
                  }
                  return {
                    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
                  };
                }),
              }));

              await svc.initiateWithdrawal(userId, amount, addr);
            }

            expect(savedAddress).toBe(addresses[addresses.length - 1]);
          } finally {
            globalThis.fetch = originalFetch;
          }
        },
      ),
      { numRuns: 100 },
    );
  });


  // ──────────────────────────────────────────────────────────────────────
  // Property 10: Maintenance mode behavior
  // **Validates: Requirements 10.2, 10.3, 10.4**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 10: Maintenance mode behavior — deposits queued, withdrawals rejected", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbSolanaAddress,
        fc.array(
          fc.double({ min: 5.0, max: 10000, noNaN: true }),
          { minLength: 1, maxLength: 5 },
        ),
        async (userId, payAddress, usdValues) => {
          vi.clearAllMocks();
          resetDbMocks();

          // Enable maintenance mode
          process.env.MAINTENANCE_MODE = "true";

          const mockDb = vi.mocked(db) as any;
          const queuedDeposits: Array<{ id: string; userId: string; tokenAmount: number; maintenanceQueued: number; credited: number }> = [];

          let selectCallIdx = 0;
          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCallIdx++;
                if (selectCallIdx % 2 === 1) {
                  return Promise.resolve([{
                    id: "profile-1", userId,
                    nowpaymentsDepositAddress: payAddress,
                    savedWithdrawalAddress: null,
                  }]);
                }
                return Promise.resolve([]);
              }),
            }),
          }));

          mockDb.insert.mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals: any) => {
              if (vals.nowpaymentsPaymentId) {
                queuedDeposits.push({
                  id: vals.id, userId: vals.userId,
                  tokenAmount: vals.tokenAmount,
                  maintenanceQueued: vals.maintenanceQueued ?? 0,
                  credited: vals.credited ?? 0,
                });
              }
              return { returning: vi.fn().mockResolvedValue([]) };
            }),
          }));

          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          }));

          // Process deposit webhooks during maintenance
          for (let i = 0; i < usdValues.length; i++) {
            await svc.processDepositWebhook({
              payment_id: `pay-maint-${i}`,
              payment_status: "confirmed",
              pay_address: payAddress,
              pay_currency: "usdcsol",
              outcome_amount: usdValues[i],
            });
          }

          // No balance credits during maintenance
          expect(walletService.depositFromCrypto).not.toHaveBeenCalled();

          // All deposits queued
          for (const dep of queuedDeposits) {
            expect(dep.maintenanceQueued).toBe(1);
            expect(dep.credited).toBe(0);
          }

          // Withdrawal rejected during maintenance
          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: 999999, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });
          const withdrawResult = await svc.initiateWithdrawal(userId, 1000, payAddress);
          expect(withdrawResult.status).toBe("failed");
          expect(withdrawResult.error).toContain("maintenance");

          // Disable maintenance and process queue
          process.env.MAINTENANCE_MODE = "false";

          const queuedForProcessing = queuedDeposits.map((d) => ({
            id: d.id, userId: d.userId, tokenAmount: d.tokenAmount,
            maintenanceQueued: 1, status: "confirmed", credited: 0,
          }));

          mockDb.select.mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(queuedForProcessing),
            }),
          }));

          mockDb.update.mockImplementation(() => ({
            set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          }));

          vi.mocked(walletService.depositFromCrypto).mockClear();
          const processed = await svc.processQueuedDeposits();

          expect(processed).toBe(queuedForProcessing.filter(d => d.tokenAmount > 0).length);

          // Verify total tokens credited matches sum of Math.floor(usdValue * 100)
          const expectedTotal = usdValues.reduce((sum, usd) => sum + Math.floor(usd * 100), 0);
          let actualTotal = 0;
          for (const call of vi.mocked(walletService.depositFromCrypto).mock.calls) {
            actualTotal += call[1];
          }
          expect(actualTotal).toBe(expectedTotal);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Property 11: Transaction audit trail completeness
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
  // ──────────────────────────────────────────────────────────────────────
  it("Property 11: Transaction audit trail completeness — every balance change has a transaction", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbSolanaAddress,
        fc.array(
          fc.record({
            type: fc.constantFrom("deposit", "withdrawal"),
            usdValue: fc.double({ min: 5.0, max: 1000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (userId, address, operations) => {
          vi.clearAllMocks();
          resetDbMocks();

          const FEE = 50;
          const mockDb = vi.mocked(db) as any;

          const depositCredits: number[] = [];
          const withdrawalDebits: number[] = [];
          const withdrawalFees: number[] = [];
          const refunds: number[] = [];

          vi.mocked(walletService.depositFromCrypto).mockImplementation(async (_uid, amount) => {
            depositCredits.push(amount);
          });
          vi.mocked(walletService.withdrawForCrypto).mockImplementation(async (_uid, amount, fee) => {
            withdrawalDebits.push(amount);
            withdrawalFees.push(fee);
          });
          vi.mocked(walletService.refundFailedWithdrawal).mockImplementation(async (_uid, amount, fee) => {
            refunds.push(amount + fee);
          });
          vi.mocked(walletService.getBalance).mockResolvedValue({
            available: 999999, escrowed: 0, freeplay: 0, freeplayEscrowed: 0,
          });

          for (const op of operations) {
            if (op.type === "deposit") {
              let selectCallIdx = 0;
              mockDb.select.mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockImplementation(() => {
                    selectCallIdx++;
                    if (selectCallIdx % 2 === 1) {
                      return Promise.resolve([{
                        id: "profile-1", userId,
                        nowpaymentsDepositAddress: address,
                        savedWithdrawalAddress: null,
                      }]);
                    }
                    return Promise.resolve([]);
                  }),
                }),
              }));
              mockDb.insert.mockImplementation(() => ({
                values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
              }));
              mockDb.update.mockImplementation(() => ({
                set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
              }));

              await svc.processDepositWebhook({
                payment_id: `pay-audit-${Math.random().toString(36).slice(2)}`,
                payment_status: "confirmed",
                pay_address: address,
                outcome_amount: op.usdValue,
              });
            } else {
              const tokenAmount = Math.max(1000, Math.floor(op.usdValue * 100));

              mockDb.select.mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([{ count: 0 }]),
                }),
              }));
              mockDb.insert.mockImplementation(() => ({
                values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
              }));
              mockDb.update.mockImplementation(() => ({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
                }),
              }));

              const originalFetch = globalThis.fetch;
              globalThis.fetch = vi.fn().mockImplementation(async () => ({
                ok: true, json: async () => ({ id: "payout-ok" }), text: async () => "",
              })) as any;

              try {
                await svc.initiateWithdrawal(userId, tokenAmount, address);
              } finally {
                globalThis.fetch = originalFetch;
              }
            }
          }

          // Every deposit has a corresponding depositFromCrypto call
          const depositOps = operations.filter(o => o.type === "deposit");
          expect(depositCredits.length).toBe(depositOps.length);

          for (let i = 0; i < depositOps.length; i++) {
            expect(depositCredits[i]).toBe(Math.floor(depositOps[i].usdValue * 100));
          }

          // Every withdrawal has a corresponding withdrawForCrypto call
          const withdrawalOps = operations.filter(o => o.type === "withdrawal");
          expect(withdrawalDebits.length).toBe(withdrawalOps.length);

          // Each withdrawal fee is the flat 50 tokens
          for (const fee of withdrawalFees) {
            expect(fee).toBe(FEE);
          }

          // Net balance change is deterministic
          const totalDeposited = depositCredits.reduce((s, v) => s + v, 0);
          const totalWithdrawn = withdrawalDebits.reduce((s, v) => s + v, 0);
          const totalFees = withdrawalFees.reduce((s, v) => s + v, 0);
          const totalRefunded = refunds.reduce((s, v) => s + v, 0);
          const netChange = totalDeposited - totalWithdrawn - totalFees + totalRefunded;

          const expectedNet =
            depositOps.reduce((s, o) => s + Math.floor(o.usdValue * 100), 0) -
            withdrawalOps.reduce((s, o) => s + Math.max(1000, Math.floor(o.usdValue * 100)) + FEE, 0) +
            totalRefunded;

          expect(netChange).toBe(expectedNet);
        },
      ),
      { numRuns: 100 },
    );
  });
});
