# Requirements Document

## Introduction

MATCHPOINT is a Discord-based competitive gaming wager platform where players challenge each other to 1v1 matches with real token stakes. The platform currently uses a demo deposit/withdrawal system where tokens are credited and debited instantly without real money movement. This feature replaces the demo system with real cryptocurrency payments using NOWPayments as the payment gateway. Players deposit USDC (on Solana) or other supported cryptocurrencies to fund their internal token balance, and withdraw USDC to their personal Solana wallet address. NOWPayments handles custody, auto-conversion of non-USDC deposits to USDC, per-user permanent deposit addresses, and payout disbursement. The internal token system (100 tokens = $1.00 USD) and the existing wallet/escrow/wager pipeline remain unchanged — only the deposit and withdrawal entry/exit points are replaced with real crypto flows.

## Glossary

- **NOWPayments_API**: The NOWPayments REST API used to create deposit addresses, process payouts, and manage payment lifecycle
- **NOWPayments_Webhook**: The HTTP callback sent by NOWPayments to the platform backend when a deposit payment status changes on-chain
- **Deposit_Address**: A permanent per-user USDC (Solana) receiving address provisioned via the NOWPayments API
- **Payout_API**: The NOWPayments payout endpoint used to send USDC from the platform custody account to a user's external wallet address
- **Wallet_Service**: The existing backend service (src/services/wallet.ts) that manages internal token balances, escrow locks, and transaction logging
- **Payment_Service**: The new backend service responsible for interfacing with the NOWPayments API for deposits and withdrawals
- **Webhook_Handler**: The new API route that receives and processes NOWPayments webhook callbacks for deposit confirmations
- **Token**: The internal platform currency unit where 100 tokens = $1.00 USD
- **USDC**: USD Coin, a stablecoin pegged 1:1 to the US dollar, used as the primary deposit and withdrawal currency on the Solana network
- **Deposit_Record**: A database record tracking the lifecycle of a single deposit (pending, confirming, confirmed, failed)
- **Withdrawal_Record**: A database record tracking the lifecycle of a single withdrawal (pending, processing, completed, failed)
- **Withdrawal_Address**: A user's personal Solana wallet address where USDC withdrawals are sent
- **Maintenance_Mode**: An admin-controlled flag that pauses all deposit and withdrawal operations platform-wide
- **Webhook_Signature**: A cryptographic signature included in NOWPayments webhook payloads, used to verify authenticity
- **Idempotency_Key**: A unique identifier (the NOWPayments payment ID) used to prevent duplicate processing of the same webhook event
- **Platform_Fee**: The 7% fee deducted from settled wager pots (unchanged by this feature)
- **Deposit_Fee**: The 0.5% fee charged by NOWPayments on deposits, absorbed by the platform so users receive full token credit
- **Withdrawal_Fee**: A flat 50-token ($0.50) fee deducted from the user's balance on each withdrawal to cover gas costs and discourage micro-withdrawals

## Requirements

### Requirement 1: Per-User Deposit Address Provisioning

**User Story:** As a player, I want a permanent crypto deposit address assigned to my account, so that I can send USDC (or other supported crypto) to fund my token balance at any time.

#### Acceptance Criteria

1. WHEN a user navigates to the wallet deposit page and no Deposit_Address exists for that user, THE Payment_Service SHALL call the NOWPayments API to create a permanent deposit address for USDC on Solana and store the address in the database linked to the user's account
2. WHEN a user navigates to the wallet deposit page and a Deposit_Address already exists for that user, THE Payment_Service SHALL return the existing stored address without calling the NOWPayments API
3. THE Wallet Page SHALL display the user's Deposit_Address as a copyable string and a QR code so the user can send funds from an external wallet
4. THE Wallet Page SHALL display a notice that the minimum deposit is $5.00 (500 tokens) and that deposits below this amount may not be credited
5. THE Wallet Page SHALL display a notice that the platform accepts USDC on Solana as the primary currency, and that other supported cryptocurrencies (BTC, ETH, SOL) are auto-converted to USDC by NOWPayments
6. IF the NOWPayments API call to create a Deposit_Address fails, THEN THE Payment_Service SHALL return a descriptive error message to the user and prompt them to retry

### Requirement 2: Deposit Webhook Processing

**User Story:** As a player, I want my token balance credited automatically when my crypto deposit confirms on-chain, so that I can start wagering without manual intervention.

#### Acceptance Criteria

1. WHEN the NOWPayments_Webhook sends a payment callback to the Webhook_Handler, THE Webhook_Handler SHALL verify the Webhook_Signature against the configured NOWPayments IPN secret before processing the payload
2. IF the Webhook_Signature verification fails, THEN THE Webhook_Handler SHALL reject the request with HTTP 403 and log the failed verification attempt
3. WHEN a valid webhook payload indicates a payment status of "confirmed" or "finished", THE Webhook_Handler SHALL calculate the token amount by converting the confirmed USD value to tokens (USD amount multiplied by 100) and credit the user's available balance via the Wallet_Service
4. THE Webhook_Handler SHALL use the NOWPayments payment ID as an Idempotency_Key, storing it in the Deposit_Record, so that processing the same webhook event multiple times does not result in duplicate balance credits
5. WHEN a valid webhook payload indicates a payment status of "confirming", THE Webhook_Handler SHALL update the Deposit_Record status to "confirming" without crediting the user's balance
6. WHEN a valid webhook payload indicates a payment status of "failed" or "expired", THE Webhook_Handler SHALL update the Deposit_Record status to "failed"
7. THE Webhook_Handler SHALL log every received webhook payload (status, payment ID, amount, user ID) for audit purposes
8. THE Platform SHALL absorb the 0.5% NOWPayments Deposit_Fee so that the user receives full token credit for the confirmed USD value of their deposit

### Requirement 3: Deposit Status Tracking

**User Story:** As a player, I want to see the status of my deposits, so that I know when my funds have been credited.

#### Acceptance Criteria

1. THE Database Schema SHALL include a deposits table with columns for: id, user ID, NOWPayments payment ID, amount in source currency, source currency type, USD value, token amount credited, status (pending, confirming, confirmed, failed), and timestamps for creation and last update
2. WHEN a new deposit is detected via webhook, THE Webhook_Handler SHALL create a Deposit_Record with status "pending" if one does not already exist for that payment ID
3. THE Wallet Page SHALL display a list of the user's recent deposits with their current status, source currency, USD value, token amount, and timestamp
4. WHEN a Deposit_Record transitions to "confirmed" status, THE Wallet Page SHALL reflect the updated available balance without requiring a full page reload (on next navigation or refresh)

### Requirement 4: Withdrawal Request and Validation

**User Story:** As a player, I want to withdraw my available token balance as USDC to my personal Solana wallet, so that I can cash out my winnings.

#### Acceptance Criteria

1. WHEN a user submits a withdrawal request, THE Payment_Service SHALL validate that the requested amount is at least 1000 tokens ($10.00 minimum withdrawal)
2. WHEN a user submits a withdrawal request, THE Payment_Service SHALL validate that the user's available balance is sufficient to cover the requested amount plus the 50-token Withdrawal_Fee
3. WHEN a user submits a withdrawal request, THE Payment_Service SHALL validate that the provided Withdrawal_Address is a valid Solana wallet address format
4. WHEN a user submits a withdrawal request, THE Payment_Service SHALL verify that the user has not exceeded 3 withdrawals in the current calendar day (UTC)
5. IF any validation check fails, THEN THE Payment_Service SHALL return a descriptive error message identifying the specific validation failure
6. WHEN all validations pass, THE Payment_Service SHALL deduct the requested amount plus the 50-token Withdrawal_Fee from the user's available balance via the Wallet_Service, create a Withdrawal_Record with status "pending", and call the NOWPayments Payout_API to initiate the USDC transfer to the user's Withdrawal_Address
7. THE Wallet_Service SHALL log two transactions for each withdrawal: one for the withdrawal amount and one for the Withdrawal_Fee

### Requirement 5: Withdrawal Status Tracking

**User Story:** As a player, I want to see the status of my withdrawals, so that I know when my USDC has been sent.

#### Acceptance Criteria

1. THE Database Schema SHALL include a withdrawals table with columns for: id, user ID, NOWPayments payout ID, token amount, USD value, Withdrawal_Address, status (pending, processing, completed, failed), and timestamps for creation and last update
2. WHEN the NOWPayments Payout_API returns a successful response, THE Payment_Service SHALL update the Withdrawal_Record status to "processing" and store the NOWPayments payout ID
3. IF the NOWPayments Payout_API returns an error, THEN THE Payment_Service SHALL update the Withdrawal_Record status to "failed" and refund the full deducted amount (withdrawal amount plus Withdrawal_Fee) back to the user's available balance via the Wallet_Service
4. WHEN a NOWPayments webhook or status poll indicates the payout is complete, THE Payment_Service SHALL update the Withdrawal_Record status to "completed"
5. WHEN a NOWPayments webhook or status poll indicates the payout has failed after initial acceptance, THE Payment_Service SHALL update the Withdrawal_Record status to "failed" and refund the full deducted amount (withdrawal amount plus Withdrawal_Fee) back to the user's available balance
6. THE Wallet Page SHALL display a list of the user's recent withdrawals with their current status, token amount, USD value, destination address (partially masked), and timestamp

### Requirement 6: Withdrawal Address Management

**User Story:** As a player, I want to save and manage my Solana wallet address for withdrawals, so that I do not have to re-enter it every time.

#### Acceptance Criteria

1. THE Database Schema SHALL include a column on the users table (or a related table) to store the user's saved Withdrawal_Address
2. WHEN a user submits a withdrawal with a new Withdrawal_Address, THE Payment_Service SHALL save the address to the user's profile for future use
3. THE Wallet Page withdrawal form SHALL pre-fill the Withdrawal_Address field with the user's saved address if one exists
4. WHEN a user updates their saved Withdrawal_Address, THE Payment_Service SHALL overwrite the previously stored address with the new one

### Requirement 7: Webhook Security and Reliability

**User Story:** As a platform operator, I want webhook processing to be secure and reliable, so that deposits are credited accurately and the system is protected from spoofed callbacks.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL verify every incoming request by computing an HMAC signature of the request body using the configured NOWPayments IPN secret and comparing it to the signature provided in the request headers
2. THE Webhook_Handler SHALL respond with HTTP 200 to valid webhook requests promptly to prevent NOWPayments from retrying the delivery
3. IF the Webhook_Handler receives a webhook with a NOWPayments payment ID that has already been processed to "confirmed" status, THEN THE Webhook_Handler SHALL skip balance crediting and respond with HTTP 200
4. THE Webhook_Handler endpoint SHALL be accessible only via HTTPS
5. THE Webhook_Handler SHALL validate that the payment ID in the webhook payload corresponds to a known Deposit_Address belonging to a registered user before processing

### Requirement 8: Minimum Deposit Enforcement

**User Story:** As a platform operator, I want to enforce a minimum deposit amount, so that micro-deposits do not create excessive transaction overhead.

#### Acceptance Criteria

1. WHEN a deposit webhook indicates a confirmed USD value below $5.00, THE Webhook_Handler SHALL update the Deposit_Record status to "confirmed" but SHALL NOT credit the user's token balance
2. WHEN a sub-minimum deposit is detected, THE Webhook_Handler SHALL log the event with the user ID, payment ID, and USD value for manual review
3. THE Wallet Page SHALL clearly display the $5.00 (500 tokens) minimum deposit requirement before the user sends funds

### Requirement 9: Rate Limiting on Withdrawals

**User Story:** As a platform operator, I want to limit the number of withdrawals per user per day, so that the system is protected from abuse and excessive gas costs.

#### Acceptance Criteria

1. THE Payment_Service SHALL enforce a maximum of 3 withdrawal requests per user per calendar day (UTC)
2. WHEN a user attempts a fourth withdrawal in the same calendar day, THE Payment_Service SHALL reject the request with a descriptive error message indicating the daily limit has been reached and when the limit resets
3. THE Wallet Page SHALL display the user's remaining withdrawal attempts for the current day

### Requirement 10: Admin Maintenance Mode

**User Story:** As a platform administrator, I want to pause all deposits and withdrawals, so that I can perform maintenance or respond to incidents without risking fund movement.

#### Acceptance Criteria

1. THE Platform SHALL support a Maintenance_Mode flag (configurable via environment variable or database setting) that controls whether deposits and withdrawals are active
2. WHILE Maintenance_Mode is enabled, THE Webhook_Handler SHALL accept and store incoming deposit webhooks but SHALL NOT credit user balances, queuing them for processing when Maintenance_Mode is disabled
3. WHILE Maintenance_Mode is enabled, THE Payment_Service SHALL reject all new withdrawal requests with a descriptive message indicating the system is under maintenance
4. WHEN Maintenance_Mode is disabled, THE Payment_Service SHALL process all queued deposit webhooks that arrived during the maintenance window, crediting user balances for confirmed payments
5. THE Wallet Page SHALL display a maintenance banner when Maintenance_Mode is enabled, informing users that deposits and withdrawals are temporarily paused

### Requirement 11: Database Schema Extension for Crypto Payments

**User Story:** As a developer, I want the database schema extended to support deposit records, withdrawal records, and payment metadata, so that all crypto payment lifecycle data is persisted and queryable.

#### Acceptance Criteria

1. THE Database Schema SHALL include a deposits table with columns: id (text, primary key), userId (text, foreign key to users), nowpaymentsPaymentId (text, unique), sourceCurrency (text), sourceAmount (text), usdValue (text), tokenAmount (bigint), status (enum: pending, confirming, confirmed, failed), createdAt (timestamp), updatedAt (timestamp)
2. THE Database Schema SHALL include a withdrawals table with columns: id (text, primary key), userId (text, foreign key to users), nowpaymentsPayoutId (text, nullable), tokenAmount (bigint), withdrawalFee (bigint), usdValue (text), destinationAddress (text), status (enum: pending, processing, completed, failed), createdAt (timestamp), updatedAt (timestamp)
3. THE Database Schema SHALL include a user_payment_profiles table (or additional columns on the users table) with columns for: nowpaymentsDepositAddress (text, nullable) and savedWithdrawalAddress (text, nullable)
4. THE transactions table SHALL support two new transaction type values: "withdrawal_fee" for the flat $0.50 fee and "deposit_credit" for webhook-confirmed deposits (or reuse existing "deposit" and "withdrawal" types with descriptive metadata)
5. THE deposits table SHALL have an index on userId and a unique index on nowpaymentsPaymentId for efficient lookup and idempotency enforcement

### Requirement 12: Wallet Page UI Replacement

**User Story:** As a player, I want the wallet page updated to show real crypto deposit and withdrawal flows instead of the demo system, so that I can manage real funds through the web interface.

#### Acceptance Criteria

1. THE Wallet Page deposit tab SHALL display the user's permanent Deposit_Address, a QR code for the address, the minimum deposit amount, and supported currencies instead of the current demo token input form
2. THE Wallet Page withdrawal tab SHALL display a form with fields for withdrawal amount (in tokens), the user's saved Withdrawal_Address (pre-filled if saved, editable), and a submit button
3. THE Wallet Page withdrawal tab SHALL display the Withdrawal_Fee (50 tokens / $0.50), the minimum withdrawal (1000 tokens / $10.00), the user's remaining daily withdrawal attempts, and the net USDC amount the user will receive after the fee
4. THE Wallet Page SHALL display a combined transaction history showing deposits, withdrawals, wager wins, escrow locks, and other token movements with status indicators
5. THE Wallet Page SHALL remove all references to the demo deposit and demo withdrawal system including the test disclaimer notices

### Requirement 13: Environment Configuration

**User Story:** As a developer, I want all NOWPayments credentials and payment configuration stored as environment variables, so that secrets are not hardcoded and configuration can vary per environment.

#### Acceptance Criteria

1. THE Platform SHALL read the following environment variables for NOWPayments integration: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, and NOWPAYMENTS_API_URL
2. THE Platform SHALL read environment variables for payment configuration: MIN_DEPOSIT_TOKENS (default 500), MIN_WITHDRAWAL_TOKENS (default 1000), WITHDRAWAL_FEE_TOKENS (default 50), and MAX_DAILY_WITHDRAWALS (default 3)
3. THE Platform SHALL read an environment variable for MAINTENANCE_MODE (default "false") to control the deposit/withdrawal pause state
4. IF any required NOWPayments environment variable is missing at startup, THEN THE Platform SHALL log an error and disable crypto payment functionality without crashing the application

### Requirement 14: Transaction Logging for Crypto Operations

**User Story:** As a platform operator, I want all crypto deposit and withdrawal operations logged as transactions, so that there is a complete audit trail for financial reconciliation.

#### Acceptance Criteria

1. WHEN a deposit is confirmed and the user's balance is credited, THE Wallet_Service SHALL create a transaction record of type "deposit" with the token amount, a reference to the deposit record ID in the description, and the user ID
2. WHEN a withdrawal is initiated, THE Wallet_Service SHALL create a transaction record of type "withdrawal" with the negative token amount, a reference to the withdrawal record ID in the description, and the user ID
3. WHEN a Withdrawal_Fee is deducted, THE Wallet_Service SHALL create a separate transaction record for the fee amount with a descriptive label
4. THE transactions table SHALL maintain referential integrity so that every token balance change from crypto operations is traceable to a specific deposit or withdrawal record
