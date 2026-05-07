# Tasks

## Task 1: Extend Database Schema

- [x] 1.1 Add nullable columns to the `wagers` table in `src/db/schema.ts`: `platform` (text), `gameMode` (text), `teamSize` (text), `rulesNotes` (text), `roundsFormat` (text), `lobbyMessageId` (text), `lobbyChannelId` (text)
- [x] 1.2 Generate and run the Drizzle migration for the new columns

## Task 2: Create LobbyService

- [x] 2.1 Create `src/services/lobby.ts` with the `LobbyService` class and `LobbyOptions` interface
- [x] 2.2 Implement `hasActiveLobby(userId)` — queries pending wagers with non-null `lobbyMessageId` for the given user
- [x] 2.3 Implement `createLobby(options)` — validates host (anti-fraud, identity, reputation, balance by mode), checks no duplicate pending lobby, calls `WagerService` to create wager with null opponentId, locks escrow, returns wager record. Set `expiresAt` using `LOBBY_EXPIRY_MINUTES` env var (default 30)
- [x] 2.4 Implement `acceptLobby(wagerId, opponentId, guildId)` — validates opponent (self-check, status check, anti-fraud, identity, reputation, balance by mode), uses atomic DB update with `status='pending' AND opponentId IS NULL` guard, locks opponent escrow, transitions to active
- [x] 2.5 Implement `cancelLobby(wagerId, userId)` — verifies user is host and status is pending, refunds host escrow, transitions to cancelled
- [x] 2.6 Implement `expireLobby(wagerId)` — refunds host escrow, transitions to expired
- [x] 2.7 Implement `buildLobbyEmbed(wager, hostUser, status)` — builds Discord EmbedBuilder with correct color per status, all required fields (game, platform, amount, currency label, host name, rep badge, expiry countdown, game rules from GameProfile)

## Task 3: Register /host Slash Command

- [x] 3.1 Add the `/host` slash command to the `commands` array in `src/bot/commands.ts` with required options (game, platform, amount, mode) and optional options (game_mode, team_size, rules_notes, rounds_format)

## Task 4: Implement /host Command Handler

- [x] 4.1 Add `handleHost` function in `src/bot/handler.ts` — extracts options from interaction, calls `LobbyService.createLobby()`, posts lobby card embed with Accept Match and Cancel Lobby buttons to the correct channel (#find-match or #free-play based on mode), stores `lobbyMessageId` and `lobbyChannelId` on the wager record, replies with ephemeral confirmation to host
- [x] 4.2 Add `"host"` case to the command switch in `handleCommand`

## Task 5: Implement Lobby Button Handlers

- [x] 5.1 Add `accept_lobby` button handler in `src/bot/buttons.ts` — calls `LobbyService.acceptLobby()`, edits lobby card to Matched status (green, disabled buttons, both player names), creates private thread, posts match rules + Ready and Cancel Match buttons, DMs host that lobby was accepted
- [x] 5.2 Add `cancel_lobby` button handler in `src/bot/buttons.ts` — verifies user is host via discordId check, calls `LobbyService.cancelLobby()`, edits lobby card to Cancelled status (red, all buttons disabled)
- [x] 5.3 Add `cancel_match` button handler in `src/bot/buttons.ts` — verifies fewer than 2 players ready, calls `WagerService.refundWager()`, posts cancellation message identifying the cancelling player, archives thread
- [x] 5.4 Update the `handleButton` switch to route `accept_lobby`, `cancel_lobby`, and `cancel_match` actions
- [x] 5.5 Modify the existing `onReady` handler to remove the Cancel Match button from the action row when both players are ready, then continue with the existing match flow (Match Over button, deadline)

## Task 6: Extend Scheduler for Lobby Expiry

- [x] 6.1 Add `expireLobbies()` method to `Scheduler` in `src/services/scheduler.ts` — queries pending wagers where `expiresAt <= now` AND `lobbyMessageId IS NOT NULL`, calls `LobbyService.expireLobby()` for each, then edits the lobby card embed to Expired status (grey, all buttons disabled) using the stored `lobbyMessageId` and `lobbyChannelId`
- [x] 6.2 Call `expireLobbies()` in the scheduler's `tick()` method

## Task 7: Update Bot Interaction Router

- [x] 7.1 Update `src/bot/index.ts` interaction router to handle the new button customId prefixes (`accept_lobby:`, `cancel_lobby:`, `cancel_match:`) by routing them to `handleButton`

## Task 8: Write Property-Based Tests

- [x] 8.1 Set up fast-check as a dev dependency and create test file `src/__tests__/lobby.property.test.ts`
- [x] 8.2 [PBT] Property 1: Lobby creation validation and wager record correctness — generate random host profiles and lobby options, verify creation succeeds iff all validations pass and produces correct wager record
- [x] 8.3 [PBT] Property 2: Escrow locking by mode — generate random valid lobbies, verify correct balance type is locked
- [x] 8.4 [PBT] Property 3: Duplicate lobby prevention — generate scenarios with existing pending lobbies, verify second creation fails
- [x] 8.5 [PBT] Property 4: Lobby embed field completeness — generate random lobby data, verify embed contains all required fields
- [x] 8.6 [PBT] Property 5: Self-acceptance rejection — generate lobbies and verify host cannot accept own lobby
- [x] 8.7 [PBT] Property 6: Non-pending acceptance rejection — generate lobbies in various non-pending statuses, verify acceptance is rejected
- [x] 8.8 [PBT] Property 7: Acceptance validation and state transition — generate random opponent profiles, verify acceptance succeeds iff validations pass
- [x] 8.9 [PBT] Property 8: Thread name and message content — generate random player names and game data, verify thread name pattern and message content
- [x] 8.10 [PBT] Property 9: Pre-ready cancellation refund — generate active wagers with varying ready counts, verify cancellation refunds both players
- [x] 8.11 [PBT] Property 10: Expiry timestamp and refund — generate lobbies with varying creation times and durations, verify expiry logic
- [x] 8.12 [PBT] Property 11: Host cancellation refund — generate pending lobbies, verify host cancellation refunds correctly
- [x] 8.13 [PBT] Property 12: Embed color mapping — generate all status values, verify correct color returned

## Task 9: Write Unit and Integration Tests

- [x] 9.1 Write unit tests for channel routing (real → #find-match, freeplay → #free-play), button customId format, env var default
- [x] 9.2 Write integration tests for lobby card lifecycle (create → accept/expire/cancel → card updated), thread creation, and coexistence with existing /wager flow
