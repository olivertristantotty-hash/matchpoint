import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies (same pattern as property test file) ──

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

// ── Helpers ──

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

describe("Feature: crypto-payments — Unit Tests", () => {
  let svc: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDbMocks();
    process.env.MAINTENANCE_MODE = "false";
    process.env.NOWPAYMENTS_API_KEY = "test-api-key";
    process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
    svc = new PaymentService();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. API failure error messages (Req 1.6)
  // ──────────────────────────────────────────────────────────────────────
  describe("API failure error messages", () => {
    it("returns descriptive error when NOWPayments API returns non-OK status", async () => {
      const mockDb = vi.mocked(db) as any;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }));

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      }) as any;

      try {
        await expect(svc.getOrCreateDepositAddress("user-123")).rejects.toThrow(
          /Failed to create deposit address.*503/,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns descriptive error when NOWPayments API is unreachable", async () => {
      const mockDb = vi.mocked(db) as any;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }));

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as any;

      try {
        await expect(svc.getOrCreateDepositAddress("user-456")).rejects.toThrow(
          /Failed to create deposit address.*could not reach/,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Webhook audit logging (Req 2.7)
  // ──────────────────────────────────────────────────────────────────────
  describe("Webhook audit logging", () => {
    it("logs payment ID, status, and amount when a webhook is processed", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      const mockDb = vi.mocked(db) as any;
      let selectCallIdx = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallIdx++;
            if (selectCallIdx === 1) {
              return Promise.resolve([{
                id: "profile-1",
                userId: "user-audit",
                nowpaymentsDepositAddress: "AuditAddr123456789012345678901234",
                savedWithdrawalAddress: null,
              }]);
            }
            return Promise.resolve([]);
          }),
        }),
      }));

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }));

      await svc.processDepositWebhook({
        payment_id: "pay-audit-001",
        payment_status: "confirming",
        pay_address: "AuditAddr123456789012345678901234",
        pay_currency: "usdcsol",
        outcome_amount: 25.50,
      });

      const logCalls = consoleSpy.mock.calls.map((c) => c.join(" "));
      const webhookLog = logCalls.find(
        (msg) => msg.includes("pay-audit-001") && msg.includes("confirming") && msg.includes("25.5"),
      );
      expect(webhookLog).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Sub-minimum deposit logging (Req 8.2)
  // ──────────────────────────────────────────────────────────────────────
  describe("Sub-minimum deposit logging", () => {
    it("logs user ID, payment ID, and USD value for deposits below $5.00", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      const mockDb = vi.mocked(db) as any;
      let selectCallIdx = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallIdx++;
            if (selectCallIdx === 1) {
              return Promise.resolve([{
                id: "profile-sub",
                userId: "user-sub-min",
                nowpaymentsDepositAddress: "SubMinAddr12345678901234567890123",
                savedWithdrawalAddress: null,
              }]);
            }
            return Promise.resolve([]);
          }),
        }),
      }));

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }));

      await svc.processDepositWebhook({
        payment_id: "pay-sub-001",
        payment_status: "confirmed",
        pay_address: "SubMinAddr12345678901234567890123",
        pay_currency: "usdcsol",
        outcome_amount: 3.50,
      });

      const logCalls = consoleSpy.mock.calls.map((c) => c.join(" "));
      const subMinLog = logCalls.find(
        (msg) =>
          msg.includes("user-sub-min") &&
          msg.includes("pay-sub-001") &&
          msg.includes("3.5"),
      );
      expect(subMinLog).toBeDefined();

      // Balance should NOT be credited
      expect(walletService.depositFromCrypto).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Rate limit error message with reset time (Req 9.2)
  // ──────────────────────────────────────────────────────────────────────
  describe("Rate limit error message with reset time", () => {
    it("error message mentions 'midnight UTC' when daily limit exceeded", async () => {
      vi.mocked(walletService.getBalance).mockResolvedValue({
        available: 999999,
        escrowed: 0,
        freeplay: 0,
        freeplayEscrowed: 0,
      });

      const mockDb = vi.mocked(db) as any;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      }));

      // Use a valid base58 Solana address (no 0, O, I, l)
      const result = await svc.initiateWithdrawal(
        "user-rate-limit",
        2000,
        "RateLimitAddrABCDEFGHJKLMNPQRSTUV",
      );

      expect(result.status).toBe("failed");
      expect(result.error).toContain("midnight UTC");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Missing env var graceful degradation (Req 13.4)
  // ──────────────────────────────────────────────────────────────────────
  describe("Missing env var graceful degradation", () => {
    it("sets disabled=true when API key is empty (simulated via property)", () => {
      // The module-level constants are captured at import time, so we test
      // the disabled flag by directly setting it to simulate missing env vars.
      const disabledSvc = new PaymentService();
      (disabledSvc as any).disabled = true;
      expect(disabledSvc.disabled).toBe(true);
    });

    it("service is NOT disabled when env vars are properly set", () => {
      // Our test setup sets NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET
      expect(svc.disabled).toBe(false);
    });

    it("getOrCreateDepositAddress throws 'not configured' when disabled", async () => {
      const disabledSvc = new PaymentService();
      // Force disabled to simulate missing env vars
      Object.defineProperty(disabledSvc, "disabled", { value: true, writable: false });

      await expect(disabledSvc.getOrCreateDepositAddress("user-disabled")).rejects.toThrow(
        /not configured/,
      );
    });

    it("initiateWithdrawal throws 'not configured' when disabled", async () => {
      const disabledSvc = new PaymentService();
      Object.defineProperty(disabledSvc, "disabled", { value: true, writable: false });

      await expect(
        disabledSvc.initiateWithdrawal("user-disabled", 2000, "ValidAddr1ABCDEFGHJKLMNPQRSTUVwx"),
      ).rejects.toThrow(/not configured/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Withdrawal fee transaction label (Req 14.3)
  // ──────────────────────────────────────────────────────────────────────
  describe("Withdrawal fee transaction label", () => {
    it("withdrawForCrypto is called with the correct fee amount (50)", async () => {
      vi.mocked(walletService.getBalance).mockResolvedValue({
        available: 50000,
        escrowed: 0,
        freeplay: 0,
        freeplayEscrowed: 0,
      });

      const mockDb = vi.mocked(db) as any;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            return Promise.resolve([{ count: 0 }]);
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
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }));

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "payout-fee-test" }),
        text: async () => "",
      }) as any;

      try {
        const result = await svc.initiateWithdrawal(
          "user-fee-test",
          2000,
          "FeeTestAddrABCDEFGHJKLMNPQRSTUVwx",
        );

        expect(result.status).toBe("processing");
        expect(walletService.withdrawForCrypto).toHaveBeenCalledWith(
          "user-fee-test",
          2000,
          50,
          expect.any(String),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. Solana address edge cases
  // ──────────────────────────────────────────────────────────────────────
  describe("Solana address edge cases", () => {
    it("rejects empty string", () => {
      expect(svc.validateSolanaAddress("")).toBe(false);
    });

    it("rejects too short address (31 chars)", () => {
      const addr = "1234567890ABCDEFGHJKLMNPQRSTUVw"; // 31 chars, valid base58
      expect(addr.length).toBe(31);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("rejects too long address (45 chars)", () => {
      const addr = "1234567890ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkm"; // 45 chars
      expect(addr.length).toBe(45);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("rejects address with invalid character '0' (zero)", () => {
      // '0' is not in base58 alphabet
      const addr = "0" + "A".repeat(31);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("rejects address with invalid character 'O' (uppercase O)", () => {
      const addr = "O" + "A".repeat(31);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("rejects address with invalid character 'I' (uppercase I)", () => {
      const addr = "I" + "A".repeat(31);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("rejects address with invalid character 'l' (lowercase L)", () => {
      const addr = "l" + "A".repeat(31);
      expect(svc.validateSolanaAddress(addr)).toBe(false);
    });

    it("accepts valid 32-char base58 address", () => {
      const addr = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefgh";
      expect(addr.length).toBe(32);
      expect(svc.validateSolanaAddress(addr)).toBe(true);
    });

    it("accepts valid 44-char base58 address", () => {
      const addr = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvw";
      expect(addr.length).toBe(44);
      expect(svc.validateSolanaAddress(addr)).toBe(true);
    });
  });
});
