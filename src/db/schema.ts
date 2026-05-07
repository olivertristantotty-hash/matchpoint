import { pgTable, text, integer, bigint, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";

// ── Enums ──

export const wagerStatusEnum = pgEnum("wager_status", [
  "pending",      // waiting for opponent to accept
  "active",       // both accepted, match in progress
  "reporting",    // match window ended, awaiting result reports
  "disputed",     // players disagree on result
  "settled",      // resolved, winner paid
  "cancelled",    // cancelled before match started
  "expired",      // no one accepted in time
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit",
  "withdrawal",
  "escrow_lock",
  "escrow_release",
  "wager_win",
  "wager_refund",
  "platform_fee",
  "deposit_credit",    // crypto deposit credited
  "withdrawal_fee",    // flat withdrawal fee
]);

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "evidence",     // collecting screenshots/proof
  "mod_review",
  "admin_review",
  "resolved",
]);

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

export const reportResultEnum = pgEnum("report_result", [
  "win",
  "loss",
]);

// ── Tables ──

export const users = pgTable("users", {
  id: text("id").primaryKey(),                    // nanoid
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  reputation: integer("reputation").notNull().default(100),
  strikes: integer("strikes").notNull().default(0),
  banned: integer("banned").notNull().default(0), // 0 = not banned, 1 = banned
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  lastDailyClaim: timestamp("last_daily_claim"),  // last time they claimed free coins
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id).unique(),
  available: bigint("available", { mode: "number" }).notNull().default(0),
  escrowed: bigint("escrowed", { mode: "number" }).notNull().default(0),
  freeplay: bigint("freeplay", { mode: "number" }).notNull().default(0),
  freeplayEscrowed: bigint("freeplay_escrowed", { mode: "number" }).notNull().default(0),
  bonusClaimed: integer("bonus_claimed").notNull().default(0),         // 0 = not claimed, 1 = claimed
  bonusAmount: bigint("bonus_amount", { mode: "number" }).notNull().default(0), // total bonus MP received
  totalWagered: bigint("total_wagered", { mode: "number" }).notNull().default(0), // lifetime MP wagered (for wagering requirement)
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),  // null for platform fee entries
  type: transactionTypeEnum("type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(), // positive = credit, negative = debit
  wagerId: text("wager_id").references(() => wagers.id),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_transactions_user").on(table.userId),
  index("idx_transactions_wager").on(table.wagerId),
]);

export const gameAccounts = pgTable("game_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(),       // "riot", "ea", "steam", etc.
  platformUserId: text("platform_user_id").notNull(),
  platformUsername: text("platform_username"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_game_accounts_unique").on(table.userId, table.platform),
]);

export const wagers = pgTable("wagers", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull().default("freeplay"),  // "freeplay" or "real"
  game: text("game").notNull(),                // "fifa", "lol", "valorant", etc.
  creatorId: text("creator_id").notNull().references(() => users.id),
  opponentId: text("opponent_id").references(() => users.id),
  amount: bigint("amount", { mode: "number" }).notNull(),  // per player
  fee: bigint("fee", { mode: "number" }).notNull().default(0),
  status: wagerStatusEnum("status").notNull().default("pending"),
  winnerId: text("winner_id").references(() => users.id),
  guildId: text("guild_id"),                   // discord server where wager was created
  channelId: text("channel_id"),
  expiresAt: timestamp("expires_at"),          // deadline to accept
  matchDeadline: timestamp("match_deadline"),   // deadline to play & report
  settledAt: timestamp("settled_at"),
  creatorClipUrl: text("creator_clip_url"),
  opponentClipUrl: text("opponent_clip_url"),
  // Lobby-specific metadata
  platform: text("platform"),
  gameMode: text("game_mode"),
  teamSize: text("team_size"),
  rulesNotes: text("rules_notes"),
  roundsFormat: text("rounds_format"),
  lobbyMessageId: text("lobby_message_id"),
  lobbyChannelId: text("lobby_channel_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_wagers_status").on(table.status),
  index("idx_wagers_creator").on(table.creatorId),
  index("idx_wagers_settled_at").on(table.settledAt),
  index("idx_wagers_winner").on(table.winnerId),
  index("idx_wagers_game").on(table.game),
  index("idx_wagers_mode").on(table.mode),
]);

export const matchReports = pgTable("match_reports", {
  id: text("id").primaryKey(),
  wagerId: text("wager_id").notNull().references(() => wagers.id),
  userId: text("user_id").notNull().references(() => users.id),
  result: reportResultEnum("result").notNull(),
  screenshotUrl: text("screenshot_url"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_reports_unique").on(table.wagerId, table.userId),
]);

export const disputes = pgTable("disputes", {
  id: text("id").primaryKey(),
  wagerId: text("wager_id").notNull().references(() => wagers.id).unique(),
  status: disputeStatusEnum("status").notNull().default("open"),
  reason: text("reason"),
  resolvedBy: text("resolved_by").references(() => users.id),
  resolution: text("resolution"),              // "creator_wins", "opponent_wins", "refund"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const seasons = pgTable("seasons", {
  id: text("id").primaryKey(),                    // nanoid
  seasonNumber: integer("season_number").notNull().unique(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  active: integer("active").notNull().default(1), // 1 = current, 0 = archived
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const seasonArchives = pgTable("season_archives", {
  id: text("id").primaryKey(),                    // nanoid
  seasonNumber: integer("season_number").notNull(),
  category: text("category").notNull(),           // "wins", "earnings", "streak"
  rank: integer("rank").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  value: integer("value").notNull(),              // the metric value at archive time
  archivedAt: timestamp("archived_at").notNull().defaultNow(),
}, (table) => [
  index("idx_season_archives_season").on(table.seasonNumber),
]);

// ── Crypto Payment Tables ──

export const deposits = pgTable("deposits", {
  id: text("id").primaryKey(),                                    // nanoid
  userId: text("user_id").notNull().references(() => users.id),
  nowpaymentsPaymentId: text("nowpayments_payment_id").notNull().unique(),
  sourceCurrency: text("source_currency"),
  sourceAmount: text("source_amount"),
  usdValue: text("usd_value"),
  tokenAmount: bigint("token_amount", { mode: "number" }),        // null if not yet credited
  status: depositStatusEnum("status").notNull().default("pending"),
  credited: integer("credited").notNull().default(0),             // 0 = not credited, 1 = credited
  maintenanceQueued: integer("maintenance_queued").notNull().default(0),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_deposits_user").on(table.userId),
  uniqueIndex("idx_deposits_payment_id").on(table.nowpaymentsPaymentId),
]);

export const withdrawals = pgTable("withdrawals", {
  id: text("id").primaryKey(),                                    // nanoid
  userId: text("user_id").notNull().references(() => users.id),
  nowpaymentsPayoutId: text("nowpayments_payout_id"),             // nullable until API responds
  tokenAmount: bigint("token_amount", { mode: "number" }).notNull(),
  withdrawalFee: bigint("withdrawal_fee", { mode: "number" }).notNull(),
  usdValue: text("usd_value").notNull(),
  destinationAddress: text("destination_address").notNull(),
  status: withdrawalStatusEnum("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_withdrawals_user").on(table.userId),
]);

export const userPaymentProfiles = pgTable("user_payment_profiles", {
  id: text("id").primaryKey(),                                    // nanoid
  userId: text("user_id").notNull().references(() => users.id).unique(),
  nowpaymentsDepositAddress: text("nowpayments_deposit_address"),
  savedWithdrawalAddress: text("saved_withdrawal_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
