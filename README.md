# WagerBot

Competitive gaming wager platform — Discord bot + web dashboard.

## Architecture

```
├── src/                        # Discord bot + backend services
│   ├── bot/
│   │   ├── index.ts            # Bot entry point, event handlers
│   │   ├── commands.ts         # Slash command definitions
│   │   ├── handler.ts          # Command logic
│   │   └── notifications.ts    # DMs, channel announcements
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (users, wallets, wagers, etc.)
│   │   └── index.ts            # DB connection
│   └── services/
│       ├── wallet.ts           # Token ledger, escrow, deposits/withdrawals
│       ├── wager.ts            # Wager lifecycle (create → accept → settle)
│       ├── user.ts             # User management
│       ├── reputation.ts       # Trust scoring + strike system
│       ├── antifraud.ts        # Collusion detection, rate limiting, bans
│       ├── verification.ts     # API-based auto-verification
│       ├── screenshot.ts       # Vision AI screenshot analysis (GPT-4o/Claude)
│       ├── match-verify.ts     # Master verification: API → OCR → manual
│       ├── scheduler.ts        # Background jobs (expiry, deadlines, auto-verify)
│       ├── games/
│       │   └── profiles.ts     # Per-game rules, OCR prompts, settings
│       └── adapters/
│           ├── base.ts         # Game adapter interface
│           ├── riot.ts         # League of Legends + Valorant (Riot API)
│           ├── manual.ts       # Fallback for games without APIs
│           └── index.ts        # Adapter registry
│
└── web/                        # Next.js web dashboard
    └── src/
        ├── app/
        │   ├── page.tsx              # Landing page
        │   ├── dashboard/page.tsx    # User dashboard (balance, stats, history)
        │   ├── wallet/              # Deposit/withdraw page
        │   ├── transactions/        # Full transaction ledger
        │   └── api/                 # REST endpoints (wallet, wagers, transactions)
        └── lib/
            ├── auth.ts              # Discord OAuth via NextAuth
            ├── db.ts                # Shared DB connection
            └── user.ts              # User/wallet/wager table refs
```

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL database (Neon, Supabase, Railway, or local)

### 1. Create a Discord Bot
1. Go to https://discord.com/developers/applications
2. Create new application
3. Bot tab → Reset Token → copy it
4. OAuth2 tab → add redirect: `http://localhost:3000/api/auth/callback/discord`
5. Invite bot: OAuth2 → URL Generator → scopes: `bot`, `applications.commands`

### 2. Environment Variables

```bash
cp .env.example .env
cp web/.env.example web/.env
```

Root `.env`:
```
DATABASE_URL=postgres://user:password@host:5432/wagerbot
DISCORD_TOKEN=bot_token
DISCORD_CLIENT_ID=application_id
PLATFORM_FEE_PERCENT=10
VISION_PROVIDER=openai
OPENAI_API_KEY=sk-...
RIOT_API_KEY=RGAPI-...
```

`web/.env`:
```
DATABASE_URL=postgres://user:password@host:5432/wagerbot
AUTH_DISCORD_ID=oauth_client_id
AUTH_DISCORD_SECRET=oauth_client_secret
AUTH_SECRET=random_secret
NEXTAUTH_URL=http://localhost:3000
```

### 3. Database
```bash
npm install
npx drizzle-kit push
```

### 4. Run
```bash
# Terminal 1: Discord bot
npm run bot

# Terminal 2: Website
cd web && npm install && npm run dev
```

## Discord Commands

| Command | Description |
|---------|-------------|
| `/wager @user game amount` | Challenge someone to a match |
| `/accept wager_id` | Accept a challenge |
| `/submit wager_id screenshot` | Submit result screenshot (primary) |
| `/report wager_id win/loss` | Manual result report (fallback) |
| `/cancel wager_id` | Cancel a pending wager |
| `/balance` | Check token balance |
| `/deposit amount` | Demo: add free tokens |
| `/reputation [user]` | Check reputation score |
| `/leaderboard` | Top players by wins |
| `/link platform username` | Link game account for auto-verify |
| `/history` | Recent wager history |
| `/resolve dispute_id outcome` | Mod: resolve disputes |

## Match Verification Flow

```
Match ends
    │
    ├── Game has API? (LoL, Valorant) → Query API → Auto-settle
    │
    └── Both players /submit screenshots
            │
            ├── Vision AI reads both → Scores match → Auto-settle
            ├── Scores don't match → Auto-dispute
            └── Can't read → Fall back to /report (manual)
```

## Token Economy
- 100 tokens = $1.00 USD equivalent
- 10% platform fee on settled wagers
- Deposits/withdrawals via website
- High-stakes (5000+ tokens): streaming recommended

## Recommended Discord Server Layout
```
📋 INFO:     #welcome  #rules  #link-accounts
🎮 WAGER:    #find-match  #active-wagers  #results
💬 CHAT:     #general  #clips
⚠️ DISPUTES: #disputes  #evidence
📊 STATS:    #leaderboard
```

Bot auto-posts to #active-wagers, #results, and #disputes.
