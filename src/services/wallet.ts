import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wallets, transactions } from "../db/schema.js";
import { nanoid } from "nanoid";

export class WalletService {
  /** Get or create a wallet for a user */
  async getWallet(userId: string) {
    const [existing] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));

    if (existing) return existing;

    const [wallet] = await db
      .insert(wallets)
      .values({ id: nanoid(), userId, available: 0, escrowed: 0 })
      .returning();

    return wallet;
  }

  /** Get available balance */
  async getBalance(userId: string) {
    const wallet = await this.getWallet(userId);
    return {
      available: wallet.available,
      escrowed: wallet.escrowed,
      freeplay: wallet.freeplay,
      freeplayEscrowed: wallet.freeplayEscrowed,
    };
  }

  /** Deposit tokens (from external payment) */
  async deposit(userId: string, amount: number, description?: string) {
    if (amount <= 0) throw new Error("Deposit amount must be positive");

    await db.update(wallets)
      .set({ available: sql`${wallets.available} + ${amount}`, updatedAt: new Date() })
      .where(eq(wallets.userId, userId));

    await this.logTransaction(userId, "deposit", amount, undefined, description);
  }

  /** Lock tokens into escrow for a wager */
  async lockEscrow(userId: string, amount: number, wagerId: string) {
    const wallet = await this.getWallet(userId);

    if (wallet.available < amount) {
      throw new Error(`Insufficient balance. Available: ${wallet.available}, needed: ${amount}`);
    }

    await db.update(wallets)
      .set({
        available: sql`${wallets.available} - ${amount}`,
        escrowed: sql`${wallets.escrowed} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    await this.logTransaction(userId, "escrow_lock", -amount, wagerId, "Tokens locked for wager");
  }

  /** Release escrow to winner */
  async releaseEscrowToWinner(winnerId: string, totalPot: number, fee: number, wagerId: string) {
    const winnings = totalPot - fee;

    // Credit winner
    await db.update(wallets)
      .set({
        available: sql`${wallets.available} + ${winnings}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, winnerId));

    await this.logTransaction(winnerId, "wager_win", winnings, wagerId, "Wager winnings");
    await this.logTransaction(null, "platform_fee", fee, wagerId, "Platform fee");
  }

  /** Remove escrowed amount after settlement (from both players) */
  async clearEscrow(userId: string, amount: number, wagerId: string) {
    await db.update(wallets)
      .set({
        escrowed: sql`${wallets.escrowed} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    await this.logTransaction(userId, "escrow_release", 0, wagerId, "Escrow cleared after settlement");
  }

  /** Refund escrowed tokens back to available */
  async refundEscrow(userId: string, amount: number, wagerId: string) {
    await db.update(wallets)
      .set({
        available: sql`${wallets.available} + ${amount}`,
        escrowed: sql`${wallets.escrowed} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    await this.logTransaction(userId, "wager_refund", amount, wagerId, "Wager refund");
  }

  /** Withdraw tokens (to external payment) */
  async withdraw(userId: string, amount: number, description?: string) {
    const wallet = await this.getWallet(userId);

    if (wallet.available < amount) {
      throw new Error(`Insufficient balance. Available: ${wallet.available}, needed: ${amount}`);
    }

    await db.update(wallets)
      .set({ available: sql`${wallets.available} - ${amount}`, updatedAt: new Date() })
      .where(eq(wallets.userId, userId));

    await this.logTransaction(userId, "withdrawal", -amount, undefined, description);
  }

  // ── Freeplay Currency ──

  /** Add daily freeplay coins */
  async addFreeplayCoins(userId: string, amount: number) {
    await db.update(wallets)
      .set({ freeplay: sql`${wallets.freeplay} + ${amount}`, updatedAt: new Date() })
      .where(eq(wallets.userId, userId));
  }

  /** Lock freeplay tokens into escrow */
  async lockFreeplayEscrow(userId: string, amount: number) {
    const wallet = await this.getWallet(userId);
    if (wallet.freeplay < amount) {
      throw new Error(`Insufficient freeplay balance. Available: ${wallet.freeplay}, needed: ${amount}`);
    }
    await db.update(wallets)
      .set({
        freeplay: sql`${wallets.freeplay} - ${amount}`,
        freeplayEscrowed: sql`${wallets.freeplay_escrowed} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));
  }

  /** Refund freeplay escrow */
  async refundFreeplayEscrow(userId: string, amount: number) {
    await db.update(wallets)
      .set({
        freeplay: sql`${wallets.freeplay} + ${amount}`,
        freeplayEscrowed: sql`GREATEST(${wallets.freeplayEscrowed} - ${amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));
  }

  /** Settle freeplay wager — winner gets pot, both escrows cleared */
  async settleFreeplay(winnerId: string, loserId: string, amount: number) {
    const winnings = amount * 2; // no fee on freeplay
    await db.update(wallets)
      .set({
        freeplayEscrowed: sql`GREATEST(${wallets.freeplayEscrowed} - ${amount}, 0)`,
        freeplay: sql`${wallets.freeplay} + ${winnings}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, winnerId));

    await db.update(wallets)
      .set({
        freeplayEscrowed: sql`GREATEST(${wallets.freeplayEscrowed} - ${amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, loserId));
  }

  /** Log a settlement win transaction */
  async logSettlement(winnerId: string, amount: number, wagerId: string) {
    await this.logTransaction(winnerId, "wager_win", amount, wagerId, "Wager winnings");
  }

  /** Log a platform fee transaction */
  async logFee(amount: number, wagerId: string) {
    await this.logTransaction(null, "platform_fee", amount, wagerId, "Platform fee");
  }

  private async logTransaction(
    userId: string | null,
    type: "deposit" | "withdrawal" | "escrow_lock" | "escrow_release" | "wager_win" | "wager_refund" | "platform_fee",
    amount: number,
    wagerId?: string,
    description?: string,
  ) {
    await db.insert(transactions).values({
      id: nanoid(),
      userId,
      type,
      amount,
      wagerId: wagerId ?? null,
      description: description ?? null,
    });
  }
}

export const walletService = new WalletService();
