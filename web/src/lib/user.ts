import { eq } from "drizzle-orm";
import { db } from "./db";
import { auth } from "./auth";
import { pgTable, text, integer, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";

// Mirror the schema tables (shared DB with the bot)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  reputation: integer("reputation").notNull().default(100),
  strikes: integer("strikes").notNull().default(0),
  banned: integer("banned").notNull().default(0),
  lastDailyClaim: timestamp("last_daily_claim"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  available: bigint("available", { mode: "number" }).notNull().default(0),
  escrowed: bigint("escrowed", { mode: "number" }).notNull().default(0),
  freeplay: bigint("freeplay", { mode: "number" }).notNull().default(0),
  freeplayEscrowed: bigint("freeplay_escrowed", { mode: "number" }).notNull().default(0),
  bonusClaimed: integer("bonus_claimed").notNull().default(0),
  bonusAmount: bigint("bonus_amount", { mode: "number" }).notNull().default(0),
  totalWagered: bigint("total_wagered", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  type: text("type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  wagerId: text("wager_id"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wagers = pgTable("wagers", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull().default("freeplay"),
  game: text("game").notNull(),
  creatorId: text("creator_id").notNull(),
  opponentId: text("opponent_id"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  fee: bigint("fee", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("pending"),
  winnerId: text("winner_id"),
  guildId: text("guild_id"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameAccounts = pgTable("game_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  platformUserId: text("platform_user_id").notNull(),
  platformUsername: text("platform_username"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
});

// ── Crypto Payment Enums ──

export const depositStatusEnum = pgEnum("deposit_status", [
  "pending",
  "confirming",
  "confirmed",
  "failed",
]);

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ── Crypto Payment Tables (mirrored from src/db/schema.ts) ──

export const deposits = pgTable("deposits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  nowpaymentsPaymentId: text("nowpayments_payment_id").notNull().unique(),
  sourceCurrency: text("source_currency"),
  sourceAmount: text("source_amount"),
  usdValue: text("usd_value"),
  tokenAmount: bigint("token_amount", { mode: "number" }),
  status: text("status").notNull().default("pending"),
  credited: integer("credited").notNull().default(0),
  maintenanceQueued: integer("maintenance_queued").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  nowpaymentsPayoutId: text("nowpayments_payout_id"),
  tokenAmount: bigint("token_amount", { mode: "number" }).notNull(),
  withdrawalFee: bigint("withdrawal_fee", { mode: "number" }).notNull(),
  usdValue: text("usd_value").notNull(),
  destinationAddress: text("destination_address").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userPaymentProfiles = pgTable("user_payment_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  nowpaymentsDepositAddress: text("nowpayments_deposit_address"),
  savedWithdrawalAddress: text("saved_withdrawal_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Get the current authenticated user's DB record */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;

  const discordId = (session as any).discordId;
  if (!discordId) return null;

  const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
  return user ?? null;
}
