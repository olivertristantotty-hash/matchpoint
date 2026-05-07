import { eq, and, sql, gte } from "drizzle-orm";
import { createHmac } from "crypto";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  deposits,
  withdrawals,
  userPaymentProfiles,
} from "../db/schema.js";
import { walletService } from "./wallet.js";

// ── Config from env vars ──

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY ?? "";
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET ?? "";
const NOWPAYMENTS_API_URL =
  process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1";
const MIN_DEPOSIT_TOKENS = Number(process.env.MIN_DEPOSIT_TOKENS ?? "500");
const MIN_WITHDRAWAL_TOKENS = Number(
  process.env.MIN_WITHDRAWAL_TOKENS ?? "1000",
);
const WITHDRAWAL_FEE_TOKENS = Number(
  process.env.WITHDRAWAL_FEE_TOKENS ?? "50",
);
const MAX_DAILY_WITHDRAWALS = Number(
  process.env.MAX_DAILY_WITHDRAWALS ?? "3",
);

// ── Types ──

export interface DepositAddressResult {
  address: string;
  currency: string;
}

export interface WithdrawalResult {
  withdrawalId: string;
  nowpaymentsPayoutId: string | null;
  status: "pending" | "processing" | "failed";
  error?: string;
}

export interface NowPaymentsWebhookPayload {
  payment_id: number | string;
  payment_status: string;
  pay_address?: string;
  pay_currency?: string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  outcome_amount?: number | string;
  outcome_currency?: string;
  price_amount?: number | string;
  price_currency?: string;
  [key: string]: unknown;
}

// ── Base58 regex for Solana addresses (32-44 chars, no 0/O/I/l) ──
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ── PaymentService ──

export class PaymentService {
  readonly disabled: boolean;

  constructor() {
    this.disabled = !NOWPAYMENTS_API_KEY || !NOWPAYMENTS_IPN_SECRET;
    if (this.disabled) {
      console.error(
        "[PaymentService] Missing NOWPAYMENTS_API_KEY or NOWPAYMENTS_IPN_SECRET — crypto payments disabled",
      );
    }
  }

  // ── 2.2 isMaintenanceMode ──

  isMaintenanceMode(): boolean {
    const val = process.env.MAINTENANCE_MODE ?? "false";
    return val === "true" || val === "1";
  }

  // ── 2.3 validateSolanaAddress ──

  validateSolanaAddress(address: string): boolean {
    return BASE58_REGEX.test(address);
  }

  // ── 2.4 verifyWebhookSignature ──

  verifyWebhookSignature(
    body: Record<string, unknown>,
    signature: string,
  ): boolean {
    if (!NOWPAYMENTS_IPN_SECRET) return false;

    const sorted = Object.keys(body)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = body[key];
        return acc;
      }, {});

    const hmac = createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
    hmac.update(JSON.stringify(sorted));
    const computed = hmac.digest("hex");

    return computed === signature;
  }

  // ── 2.5 getOrCreateDepositAddress ──

  async getOrCreateDepositAddress(
    userId: string,
  ): Promise<DepositAddressResult> {
    if (this.disabled) {
      throw new Error("Crypto payments are not configured");
    }

    // Check for existing profile with address
    const [profile] = await db
      .select()
      .from(userPaymentProfiles)
      .where(eq(userPaymentProfiles.userId, userId));

    if (profile?.nowpaymentsDepositAddress) {
      return {
        address: profile.nowpaymentsDepositAddress,
        currency: "usdcsol",
      };
    }

    // Call NOWPayments API to create a permanent deposit address
    let address: string;
    try {
      const res = await fetch(`${NOWPAYMENTS_API_URL}/sub-partner/balance`, {
        method: "POST",
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currency: "usdcsol" }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[PaymentService] NOWPayments create address failed (${res.status}): ${text}`,
        );
        throw new Error(
          `Failed to create deposit address: NOWPayments API returned ${res.status}`,
        );
      }

      const data = (await res.json()) as { address?: string };
      if (!data.address) {
        throw new Error(
          "Failed to create deposit address: no address in API response",
        );
      }
      address = data.address;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Failed to create")) {
        throw err;
      }
      console.error("[PaymentService] NOWPayments API error:", err);
      throw new Error(
        "Failed to create deposit address: could not reach NOWPayments API",
      );
    }

    // Upsert payment profile
    if (profile) {
      await db
        .update(userPaymentProfiles)
        .set({
          nowpaymentsDepositAddress: address,
          updatedAt: new Date(),
        })
        .where(eq(userPaymentProfiles.userId, userId));
    } else {
      await db.insert(userPaymentProfiles).values({
        id: nanoid(),
        userId,
        nowpaymentsDepositAddress: address,
      });
    }

    return { address, currency: "usdcsol" };
  }

  // ── 2.6 getDailyWithdrawalCount ──

  async getDailyWithdrawalCount(userId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.userId, userId),
          gte(withdrawals.createdAt, startOfDay),
        ),
      );

    return result[0]?.count ?? 0;
  }

  // ── 2.7 processDepositWebhook ──

  async processDepositWebhook(payload: NowPaymentsWebhookPayload): Promise<void> {
    const paymentId = String(payload.payment_id);
    const status = payload.payment_status;
    const payAddress = payload.pay_address ? String(payload.pay_address) : null;

    console.log(
      `[PaymentService] Webhook received: paymentId=${paymentId} status=${status} amount=${payload.outcome_amount ?? payload.price_amount}`,
    );

    // Look up user by deposit address
    let userId: string | null = null;
    if (payAddress) {
      const [profile] = await db
        .select()
        .from(userPaymentProfiles)
        .where(eq(userPaymentProfiles.nowpaymentsDepositAddress, payAddress));
      userId = profile?.userId ?? null;
    }

    if (!userId) {
      console.log(
        `[PaymentService] Webhook for unknown address ${payAddress}, paymentId=${paymentId} — skipping`,
      );
      return;
    }

    // Check for existing deposit record (idempotency)
    const [existing] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.nowpaymentsPaymentId, paymentId));

    const usdValue = payload.outcome_amount
      ? String(payload.outcome_amount)
      : payload.price_amount
        ? String(payload.price_amount)
        : null;

    if (status === "confirming") {
      if (existing) {
        await db
          .update(deposits)
          .set({
            status: "confirming",
            sourceCurrency: payload.pay_currency
              ? String(payload.pay_currency)
              : existing.sourceCurrency,
            sourceAmount: payload.actually_paid
              ? String(payload.actually_paid)
              : existing.sourceAmount,
            usdValue: usdValue ?? existing.usdValue,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, existing.id));
      } else {
        await db.insert(deposits).values({
          id: nanoid(),
          userId,
          nowpaymentsPaymentId: paymentId,
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : null,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : null,
          usdValue,
          status: "confirming",
        });
      }
      return;
    }

    if (status === "confirmed" || status === "finished") {
      const usdNum = usdValue ? parseFloat(usdValue) : 0;
      const tokenAmount = Math.floor(usdNum * 100);

      if (existing) {
        // Already credited? Skip
        if (existing.credited === 1) {
          console.log(
            `[PaymentService] Deposit ${paymentId} already credited — skipping`,
          );
          return;
        }

        // Check minimum
        if (usdNum < 5.0) {
          console.log(
            `[PaymentService] Sub-minimum deposit: userId=${userId} paymentId=${paymentId} usdValue=${usdNum}`,
          );
          await db
            .update(deposits)
            .set({
              status: "confirmed",
              usdValue: usdValue ?? existing.usdValue,
              tokenAmount,
              updatedAt: new Date(),
            })
            .where(eq(deposits.id, existing.id));
          return;
        }

        // Maintenance mode — queue instead of crediting
        if (this.isMaintenanceMode()) {
          await db
            .update(deposits)
            .set({
              status: "confirmed",
              usdValue: usdValue ?? existing.usdValue,
              tokenAmount,
              maintenanceQueued: 1,
              updatedAt: new Date(),
            })
            .where(eq(deposits.id, existing.id));
          return;
        }

        // Credit balance
        await walletService.depositFromCrypto(userId, tokenAmount, existing.id);
        await db
          .update(deposits)
          .set({
            status: "confirmed",
            usdValue: usdValue ?? existing.usdValue,
            tokenAmount,
            credited: 1,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, existing.id));
      } else {
        // New deposit record
        const depositId = nanoid();

        if (usdNum < 5.0) {
          console.log(
            `[PaymentService] Sub-minimum deposit: userId=${userId} paymentId=${paymentId} usdValue=${usdNum}`,
          );
          await db.insert(deposits).values({
            id: depositId,
            userId,
            nowpaymentsPaymentId: paymentId,
            sourceCurrency: payload.pay_currency
              ? String(payload.pay_currency)
              : null,
            sourceAmount: payload.actually_paid
              ? String(payload.actually_paid)
              : null,
            usdValue,
            tokenAmount,
            status: "confirmed",
          });
          return;
        }

        if (this.isMaintenanceMode()) {
          await db.insert(deposits).values({
            id: depositId,
            userId,
            nowpaymentsPaymentId: paymentId,
            sourceCurrency: payload.pay_currency
              ? String(payload.pay_currency)
              : null,
            sourceAmount: payload.actually_paid
              ? String(payload.actually_paid)
              : null,
            usdValue,
            tokenAmount,
            status: "confirmed",
            maintenanceQueued: 1,
          });
          return;
        }

        await db.insert(deposits).values({
          id: depositId,
          userId,
          nowpaymentsPaymentId: paymentId,
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : null,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : null,
          usdValue,
          tokenAmount,
          status: "confirmed",
          credited: 1,
        });
        await walletService.depositFromCrypto(userId, tokenAmount, depositId);
      }
      return;
    }

    if (status === "failed" || status === "expired") {
      if (existing) {
        await db
          .update(deposits)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(deposits.id, existing.id));
      } else {
        await db.insert(deposits).values({
          id: nanoid(),
          userId,
          nowpaymentsPaymentId: paymentId,
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : null,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : null,
          usdValue,
          status: "failed",
        });
      }
      return;
    }
  }

  // ── 2.8 initiateWithdrawal ──

  async initiateWithdrawal(
    userId: string,
    tokenAmount: number,
    destinationAddress: string,
  ): Promise<WithdrawalResult> {
    if (this.disabled) {
      throw new Error("Crypto payments are not configured");
    }

    // Maintenance mode check
    if (this.isMaintenanceMode()) {
      return {
        withdrawalId: "",
        nowpaymentsPayoutId: null,
        status: "failed",
        error:
          "System under maintenance. Deposits and withdrawals are temporarily paused",
      };
    }

    // Minimum amount
    if (tokenAmount < MIN_WITHDRAWAL_TOKENS) {
      return {
        withdrawalId: "",
        nowpaymentsPayoutId: null,
        status: "failed",
        error: `Minimum withdrawal is ${MIN_WITHDRAWAL_TOKENS} MP ($${(MIN_WITHDRAWAL_TOKENS / 100).toFixed(2)})`,
      };
    }

    // Valid Solana address
    if (!this.validateSolanaAddress(destinationAddress)) {
      return {
        withdrawalId: "",
        nowpaymentsPayoutId: null,
        status: "failed",
        error: "Invalid Solana wallet address",
      };
    }

    // Daily limit
    const dailyCount = await this.getDailyWithdrawalCount(userId);
    if (dailyCount >= MAX_DAILY_WITHDRAWALS) {
      return {
        withdrawalId: "",
        nowpaymentsPayoutId: null,
        status: "failed",
        error:
          "Daily withdrawal limit reached. Resets at midnight UTC",
      };
    }

    // Sufficient balance (amount + fee)
    const totalDeduction = tokenAmount + WITHDRAWAL_FEE_TOKENS;
    const balance = await walletService.getBalance(userId);
    if (balance.available < totalDeduction) {
      return {
        withdrawalId: "",
        nowpaymentsPayoutId: null,
        status: "failed",
        error: `Insufficient balance. Available: ${balance.available}, need: ${totalDeduction}`,
      };
    }

    // Deduct balance + fee
    await walletService.withdrawForCrypto(
      userId,
      tokenAmount,
      WITHDRAWAL_FEE_TOKENS,
      "", // placeholder — will update after record creation
    );

    // Create withdrawal record
    const withdrawalId = nanoid();
    const usdValue = (tokenAmount / 100).toFixed(2);

    await db.insert(withdrawals).values({
      id: withdrawalId,
      userId,
      tokenAmount,
      withdrawalFee: WITHDRAWAL_FEE_TOKENS,
      usdValue,
      destinationAddress,
      status: "pending",
    });

    // Call NOWPayments Payout API (requires JWT auth)
    let nowpaymentsPayoutId: string | null = null;
    try {
      // Get JWT token
      const email = process.env.NOWPAYMENTS_EMAIL ?? "";
      const password = process.env.NOWPAYMENTS_PASSWORD ?? "";

      const authRes = await fetch(`${NOWPAYMENTS_API_URL}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!authRes.ok) {
        const authText = await authRes.text();
        console.error(`[PaymentService] NOWPayments auth failed (${authRes.status}): ${authText}`);
        throw new Error(`Auth failed: ${authRes.status}`);
      }

      const { token: jwtToken } = (await authRes.json()) as { token: string };

      const res = await fetch(`${NOWPAYMENTS_API_URL}/payout`, {
        method: "POST",
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          withdrawals: [{
            address: destinationAddress,
            currency: "usdcsol",
            amount: parseFloat(usdValue),
          }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[PaymentService] NOWPayments payout failed (${res.status}): ${text}`,
        );
        throw new Error(`Payout API returned ${res.status}`);
      }

      const data = (await res.json()) as { id?: string | number };
      nowpaymentsPayoutId = data.id ? String(data.id) : null;

      // Update to processing
      await db
        .update(withdrawals)
        .set({
          status: "processing",
          nowpaymentsPayoutId,
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, withdrawalId));
    } catch (err) {
      console.error("[PaymentService] Payout API error:", err);

      // Mark failed and refund
      await db
        .update(withdrawals)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(withdrawals.id, withdrawalId));

      await walletService.refundFailedWithdrawal(
        userId,
        tokenAmount,
        WITHDRAWAL_FEE_TOKENS,
        withdrawalId,
      );

      return {
        withdrawalId,
        nowpaymentsPayoutId: null,
        status: "failed",
        error: "Withdrawal failed. Your balance has been refunded.",
      };
    }

    // Save/update withdrawal address in payment profile
    const [profile] = await db
      .select()
      .from(userPaymentProfiles)
      .where(eq(userPaymentProfiles.userId, userId));

    if (profile) {
      await db
        .update(userPaymentProfiles)
        .set({
          savedWithdrawalAddress: destinationAddress,
          updatedAt: new Date(),
        })
        .where(eq(userPaymentProfiles.userId, userId));
    } else {
      await db.insert(userPaymentProfiles).values({
        id: nanoid(),
        userId,
        savedWithdrawalAddress: destinationAddress,
      });
    }

    return {
      withdrawalId,
      nowpaymentsPayoutId,
      status: "processing",
    };
  }

  // ── 2.9 processQueuedDeposits ──

  async processQueuedDeposits(): Promise<number> {
    const queued = await db
      .select()
      .from(deposits)
      .where(
        and(
          eq(deposits.maintenanceQueued, 1),
          eq(deposits.status, "confirmed"),
          eq(deposits.credited, 0),
        ),
      );

    let processed = 0;
    for (const deposit of queued) {
      if (!deposit.tokenAmount || deposit.tokenAmount <= 0) continue;

      try {
        await walletService.depositFromCrypto(
          deposit.userId,
          deposit.tokenAmount,
          deposit.id,
        );
        await db
          .update(deposits)
          .set({
            credited: 1,
            maintenanceQueued: 0,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, deposit.id));
        processed++;
      } catch (err) {
        console.error(
          `[PaymentService] Failed to process queued deposit ${deposit.id}:`,
          err,
        );
      }
    }

    return processed;
  }
}

// ── 2.10 Singleton export ──

export const paymentService = new PaymentService();
