# Requirements Document

## Introduction

The Host Wager Lobby feature introduces an open marketplace model for MATCHPOINT, a Discord-based peer-to-peer skill-based gaming wager platform. Instead of requiring players to challenge specific opponents via `/wager @opponent`, players can use a `/host` command to create an open lobby with all match details configured upfront. The lobby is posted as a compact card in the appropriate Discord channel (`#find-match` for real money, `#free-play` for freeplay). Any eligible player can browse these cards and accept a match. This replaces channel spam with a clean, scannable lobby system while coexisting with the existing direct challenge flow.

## Glossary

- **Host**: The player who creates an open wager lobby using the `/host` command
- **Opponent**: The player who accepts an open wager lobby by clicking the Accept Match button
- **Lobby**: An open wager listing created by a Host, displayed as a card embed in a Discord channel, awaiting an Opponent
- **Lobby_Card**: The Discord embed message representing a Lobby, displaying match details and an Accept Match button
- **Lobby_Service**: The backend service responsible for creating, expiring, cancelling, and managing Lobby lifecycle
- **Wager_Service**: The existing backend service that handles wager creation, acceptance, reporting, and settlement
- **Wallet_Service**: The existing backend service that handles token balances, escrow locks, and refunds
- **Escrow**: Tokens locked from a player's available balance to guarantee wager commitment
- **Match_Thread**: A private Discord thread created when an Opponent accepts a Lobby, used for match coordination
- **Reputation_Service**: The existing service that tracks player reputation scores and enforces tiered betting limits
- **Game_Profile**: A per-game configuration defining rules, modes, verification method, and match settings
- **Expiry_Duration**: The configurable time window after which an unaccepted Lobby automatically expires (default: 30 minutes)
- **Find_Match_Channel**: The Discord channel (`#find-match`) where real-money Lobby cards are posted
- **Free_Play_Channel**: The Discord channel (`#free-play`) where freeplay Lobby cards are posted

## Requirements

### Requirement 1: Host Command Registration

**User Story:** As a player, I want a `/host` slash command available in Discord, so that I can create an open wager lobby without needing to tag a specific opponent.

#### Acceptance Criteria

1. THE Bot SHALL register a `/host` slash command with required options for game, platform, amount, and mode, and optional options for game mode, team size, rules notes, and rounds format
2. WHEN a player invokes `/host`, THE Bot SHALL present the command options for game (with choices matching existing game profiles: FIFA / EA FC, League of Legends, Valorant, Rocket League, Call of Duty, Fortnite, Other), platform (PC, Xbox, PlayStation, Cross-Platform), wager amount (integer, minimum 10), and mode (real, freeplay defaulting to real)
3. THE Bot SHALL validate that the amount option has a minimum value of 10

### Requirement 2: Lobby Creation and Validation

**User Story:** As a player, I want the system to validate my eligibility and lock my tokens when I host a lobby, so that I know my lobby is legitimate and funded.

#### Acceptance Criteria

1. WHEN a player invokes `/host` with mode "real", THE Lobby_Service SHALL perform anti-fraud checks, identity verification, and reputation-based betting limit checks on the Host before creating the Lobby
2. WHEN a player invokes `/host` with mode "real", THE Wallet_Service SHALL verify the Host has sufficient available token balance for the wager amount before creating the Lobby
3. WHEN a player invokes `/host` with mode "freeplay", THE Wallet_Service SHALL verify the Host has sufficient freeplay coin balance for the wager amount before creating the Lobby
4. IF the Host fails any validation check (insufficient balance, anti-fraud failure, identity not linked, reputation too low), THEN THE Lobby_Service SHALL return a descriptive error message to the Host and not create the Lobby
5. WHEN all validation checks pass, THE Lobby_Service SHALL create a new wager record with status "pending", a null opponentId, and the Lobby metadata (game, platform, amount, mode, game mode, team size, rules notes, rounds format)
6. WHEN the wager record is created for mode "real", THE Wallet_Service SHALL lock the Host's wager amount into escrow
7. WHEN the wager record is created for mode "freeplay", THE Wallet_Service SHALL lock the Host's freeplay coins into escrow
8. THE Lobby_Service SHALL prevent a player from hosting a new Lobby while that player already has an active open Lobby in pending status

### Requirement 3: Lobby Card Display

**User Story:** As a player browsing for matches, I want to see clean, informative lobby cards in the channel, so that I can quickly find a match that suits me.

#### Acceptance Criteria

1. WHEN a Lobby is created with mode "real", THE Bot SHALL post the Lobby_Card as a Discord embed message in the Find_Match_Channel
2. WHEN a Lobby is created with mode "freeplay", THE Bot SHALL post the Lobby_Card as a Discord embed message in the Free_Play_Channel
3. THE Lobby_Card SHALL display the following information in a compact format: game name, platform, wager amount (with currency label "tokens" for real or "coins" for freeplay), Host display name, Host reputation badge (emoji and score from Reputation_Service), and lobby expiry countdown
4. THE Lobby_Card SHALL include an expandable section or additional fields showing full game rules loaded from the Game_Profile for the selected game
5. THE Lobby_Card SHALL include an [Accept Match] button with a unique custom ID referencing the wager ID
6. THE Lobby_Card SHALL display one card per Lobby with no duplicate or redundant messages for the same Lobby

### Requirement 4: Lobby Acceptance Flow

**User Story:** As a player, I want to accept an open lobby by clicking a button, so that I can quickly join a match without negotiating terms.

#### Acceptance Criteria

1. WHEN a player clicks the [Accept Match] button on a Lobby_Card, THE Lobby_Service SHALL verify the Opponent is not the same player as the Host
2. WHEN a player clicks the [Accept Match] button on a Lobby_Card, THE Lobby_Service SHALL verify the Lobby status is still "pending" (not expired, cancelled, or already accepted)
3. WHEN a player clicks [Accept Match] with mode "real", THE Lobby_Service SHALL perform anti-fraud checks, identity verification, and reputation-based betting limit checks on the Opponent
4. WHEN a player clicks [Accept Match] with mode "real", THE Wallet_Service SHALL verify the Opponent has sufficient available token balance and lock the Opponent's wager amount into escrow
5. WHEN a player clicks [Accept Match] with mode "freeplay", THE Wallet_Service SHALL verify the Opponent has sufficient freeplay coin balance and lock the Opponent's freeplay coins into escrow
6. IF the Opponent fails any validation check, THEN THE Lobby_Service SHALL send an ephemeral error message to the Opponent and leave the Lobby in pending status for other players
7. WHEN the Opponent passes all checks and escrow is locked, THE Lobby_Service SHALL update the wager record with the Opponent's ID and transition the wager status from "pending" to "active"
8. WHEN the Lobby is accepted, THE Bot SHALL update the original Lobby_Card to indicate the match has been taken (disable the Accept Match button and update the embed to show "Matched" status with both player names)

### Requirement 5: Match Thread Creation

**User Story:** As a matched player, I want a private thread created for my match, so that I can coordinate with my opponent without cluttering the public channel.

#### Acceptance Criteria

1. WHEN a Lobby is accepted, THE Bot SHALL create a private Discord thread in the same channel where the Lobby_Card was posted
2. THE Match_Thread SHALL be named with a pattern that includes both player names and the game (e.g., "PlayerA vs PlayerB — FIFA")
3. THE Match_Thread SHALL include only the Host and the Opponent as members
4. WHEN the Match_Thread is created, THE Bot SHALL post the full match rules from the Game_Profile, the wager amount, and any custom rules notes configured by the Host
5. WHEN the Match_Thread is created, THE Bot SHALL post a [Ready] button for both players to confirm they are ready to play
6. THE Match_Thread message SHALL state that both players have agreed to the rules by accepting the match

### Requirement 6: Pre-Match Cancellation and Refund

**User Story:** As a matched player, I want to cancel before both players are ready, so that I can back out without penalty if something comes up.

#### Acceptance Criteria

1. WHILE the wager status is "active" and fewer than two players have clicked [Ready], THE Bot SHALL display a [Cancel Match] button in the Match_Thread
2. WHEN either the Host or the Opponent clicks [Cancel Match] before both players have clicked [Ready], THE Lobby_Service SHALL transition the wager status to "cancelled"
3. WHEN a match is cancelled before both players are ready, THE Wallet_Service SHALL refund the full escrowed amount to both the Host and the Opponent
4. WHEN a match is cancelled, THE Bot SHALL post a cancellation confirmation message in the Match_Thread identifying which player cancelled
5. WHEN a match is cancelled, THE Bot SHALL archive the Match_Thread

### Requirement 7: Ready Confirmation and Match Start

**User Story:** As a matched player, I want to confirm I'm ready, so that the match only starts when both players are committed.

#### Acceptance Criteria

1. WHEN a player clicks [Ready] in the Match_Thread, THE Bot SHALL record that player as ready and post a confirmation message in the thread
2. WHEN both the Host and the Opponent have clicked [Ready], THE Bot SHALL remove the [Cancel Match] button from the Match_Thread
3. WHEN both players are ready, THE Bot SHALL post a "Match Started" message with a [Match Over] button and set the match deadline on the wager record
4. WHEN both players are ready, THE Lobby_Service SHALL transition the match into the standard match flow (play, match over, screenshot, settle) using the existing Wager_Service pipeline

### Requirement 8: Lobby Expiry

**User Story:** As a host, I want my lobby to automatically expire if nobody accepts it, so that my tokens are not locked indefinitely.

#### Acceptance Criteria

1. WHEN a Lobby is created, THE Lobby_Service SHALL set an expiry timestamp on the wager record equal to the current time plus the Expiry_Duration
2. WHEN the Expiry_Duration elapses and the Lobby status is still "pending", THE Lobby_Service SHALL transition the wager status to "expired"
3. WHEN a Lobby expires, THE Wallet_Service SHALL refund the full escrowed amount to the Host
4. WHEN a Lobby expires, THE Bot SHALL update the original Lobby_Card to indicate the lobby has expired (disable the Accept Match button and update the embed to show "Expired" status)
5. THE Expiry_Duration SHALL be configurable via an environment variable with a default value of 30 minutes

### Requirement 9: Host Cancellation Before Acceptance

**User Story:** As a host, I want to cancel my open lobby before anyone accepts it, so that I can get my tokens back if I change my mind.

#### Acceptance Criteria

1. WHILE the Lobby status is "pending", THE Lobby_Card SHALL include a [Cancel Lobby] button visible only to the Host (using an ephemeral interaction check)
2. WHEN the Host clicks [Cancel Lobby], THE Lobby_Service SHALL transition the wager status to "cancelled"
3. WHEN the Host cancels a pending Lobby, THE Wallet_Service SHALL refund the full escrowed amount to the Host
4. WHEN the Host cancels a pending Lobby, THE Bot SHALL update the original Lobby_Card to indicate the lobby has been cancelled (disable all buttons and update the embed to show "Cancelled" status)

### Requirement 10: Channel Cleanup

**User Story:** As a player browsing lobbies, I want expired, cancelled, and accepted lobby cards to be visually distinct or removed, so that the channel stays clean and scannable.

#### Acceptance Criteria

1. WHEN a Lobby_Card transitions to "Matched", "Expired", or "Cancelled" status, THE Bot SHALL edit the Lobby_Card embed to use a distinct color per status (e.g., green for Matched, grey for Expired, red for Cancelled)
2. WHEN a Lobby_Card transitions to "Expired" or "Cancelled" status, THE Bot SHALL disable all interactive buttons on the Lobby_Card
3. WHEN a Lobby_Card transitions to "Matched" status, THE Bot SHALL disable the Accept Match button on the Lobby_Card

### Requirement 11: Coexistence with Direct Challenge

**User Story:** As a player, I want the existing direct challenge flow (`/wager @opponent`, right-click "Challenge to Wager") to continue working alongside the lobby system, so that I can still challenge specific players when I want to.

#### Acceptance Criteria

1. THE Bot SHALL continue to register and handle the `/wager`, `/freeplay`, "Challenge to Wager", and "Freeplay Challenge" commands without modification
2. THE Lobby_Service SHALL use the existing Wager_Service for wager record creation, ensuring lobby-created wagers and direct-challenge wagers share the same data model and settlement pipeline
3. THE Bot SHALL route lobby-created wagers into the same match flow (ready, match over, screenshot, report, settle) as direct-challenge wagers after both players are ready

### Requirement 12: Database Schema Extension

**User Story:** As a developer, I want the wager data model extended to support lobby-specific metadata, so that lobby wagers can store platform, game mode, team size, rules notes, and rounds format.

#### Acceptance Criteria

1. THE Database Schema SHALL include additional nullable columns on the wagers table for: platform (text), gameMode (text), teamSize (text), rulesNotes (text), roundsFormat (text), and lobbyMessageId (text, storing the Discord message ID of the Lobby_Card)
2. THE Database Schema SHALL include an additional nullable column on the wagers table for lobbyChannelId (text, storing the Discord channel ID where the Lobby_Card was posted)
3. WHEN a Lobby is created, THE Lobby_Service SHALL persist the lobbyMessageId and lobbyChannelId on the wager record so the Bot can later edit or disable the Lobby_Card
