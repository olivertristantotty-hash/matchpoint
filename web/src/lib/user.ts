import { eq } from "drizzle-orm";
import { db } from "./db";
import { auth } from "./auth";
import { pgTable, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";

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

/** Get the current authenticated user's DB record */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;

  const discordId = (session as any).discordId;
  if (!discordId) return null;

  const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
  return user ?? null;
}
