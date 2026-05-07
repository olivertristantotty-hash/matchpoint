# Tasks

## Task 1: Extend Database Schema

- [x] 1.1 Add `depositStatusEnum` and `withdrawalStatusEnum` pgEnums to `src/db/schema.ts`
- [x] 1.2 Add `deposits` table to `src/db/schema.ts` with columns: id, userId, nowpaymentsPaymentId (unique), sourceCurrency, sourceAmount, usdValue, tokenAmount, status, credited (integer 0/1), maintenanceQueued (integer 0/1), createdAt, updatedAt. Include index on userId and unique index on nowpaymentsPaymentId
- [x] 1.3 Add `withdrawals` table to `src/db/schema.ts` with columns: id, userId, nowpaymentsPayoutId (nullable), tokenAmount, withdrawalFee, usdValue, destinationAddress, status, createdAt, updatedAt. Include index on userId
- [x] 1.4 Add `userPaymentProfiles` table to `src/db/schema.ts` with columns: id, userId (unique, FK to users), nowpaymentsDepositAddress (nullable), savedWithdrawalAddress (nullable), createdAt, updatedAt
- [x] 1.5 Add "deposit_credit" and "withdrawal_fee" values to the existing `transactionTypeEnum` in `src/db/schema.ts`
- [x] 1.6 Generate the Drizzle migration with `npx drizzle-kit generate`

## Task 2: Create PaymentService

- [x] 2.1 Create `src/services/payment.ts` with the `PaymentService` class, config constants read from env vars (NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, NOWPAYMENTS_API_URL, MIN_DEPOSIT_TOKENS, MIN_WITHDRAWAL_TOKENS, WITHDRAWAL_FEE_TOKENS, MAX_DAILY_WITHDRAWALS, MAINTENANCE_MODE), and a `disabled` flag set if required env vars are missing
- [x] 2.2 Implement `isMaintenanceMode()` — reads MAINTENANCE_MODE env var, returns boolean
- [x] 2.3 Implement `validateSolanaAddress(address)` — validates base58 format, 32–44 characters, returns boolean
- [x] 2.4 Implement `verifyWebhookSignature(body, signature)` — sorts body keys alphabetically, computes HMAC-SHA512 with IPN secret, compares to provided signature, returns boolean
- [x] 2.5 Implement `getOrCreateDepositAddress(userId)` — checks `userPaymentProfiles` for existing address, if none calls NOWPayments API (`POST /v1/sub-partner/balance`) to create permanent USDC (Solana) address, stores in DB, returns address. Handles API errors with descriptive messages
- [x] 2.6 Implement `getDailyWithdrawalCount(userId)` — counts withdrawals for the user where createdAt is within the current UTC day
- [x] 2.7 Implement `processDepositWebhook(payload)` — looks up user by deposit address, upserts deposit record using nowpaymentsPaymentId as idempotency key, handles status transitions (confirming → update only, confirmed/finished → check minimum $5.00 USD and credited flag, credit balance via WalletService if qualifying, failed/expired → mark failed). Respects maintenance mode by setting maintenanceQueued flag instead of crediting
- [x] 2.8 Implement `initiateWithdrawal(userId, tokenAmount, destinationAddress)` — validates minimum amount (1000 tokens), sufficient balance (amount + fee), valid Solana address, daily limit (< 3), maintenance mode not active. On pass: deducts balance + fee via WalletService, creates withdrawal record, calls NOWPayments Payout API, updates record to "processing" on success or "failed" + refund on error. Saves/updates withdrawal address in userPaymentProfiles
- [x] 2.9 Implement `processQueuedDeposits()` — finds all deposit records with maintenanceQueued=1 and status="confirmed" and credited=0, credits each via WalletService, clears maintenanceQueued flag
- [x] 2.10 Export singleton `paymentService` instance

## Task 3: Extend WalletService

- [x] 3.1 Add `depositFromCrypto(userId, tokenAmount, depositId)` method to `WalletService` — credits available balance, logs transaction of type "deposit_credit" with deposit ID in description
- [x] 3.2 Add `withdrawForCrypto(userId, tokenAmount, fee, withdrawalId)` method to `WalletService` — deducts (amount + fee) from available balance, logs two transactions: "withdrawal" with negative amount and "withdrawal_fee" with negative fee amount, both referencing withdrawal ID
- [x] 3.3 Add `refundFailedWithdrawal(userId, tokenAmount, fee, withdrawalId)` method to `WalletService` — restores (amount + fee) to available balance, logs refund transaction

## Task 4: Update Environment Configuration

- [x] 4.1 Add NOWPayments and payment config variables to `.env.example`: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, NOWPAYMENTS_API_URL, MIN_DEPOSIT_TOKENS, MIN_WITHDRAWAL_TOKENS, WITHDRAWAL_FEE_TOKENS, MAX_DAILY_WITHDRAWALS, MAINTENANCE_MODE
- [x] 4.2 Add the same variables to `web/.env.example`

## Task 5: Create Webhook Handler API Route

- [x] 5.1 Create `web/src/app/api/webhooks/nowpayments/route.ts` with POST handler — reads raw request body, extracts `x-nowpayments-sig` header, calls `paymentService.verifyWebhookSignature()`, returns 403 on failure. On success, calls `paymentService.processDepositWebhook()` and returns 200
- [x] 5.2 Add mirrored table definitions for `deposits`, `withdrawals`, and `userPaymentProfiles` in `web/src/lib/user.ts`

## Task 6: Create Deposit Address API Route

- [x] 6.1 Create `web/src/app/api/wallet/deposit-address/route.ts` with GET handler — authenticates user, calls `paymentService.getOrCreateDepositAddress()`, returns address and currency

## Task 7: Replace Withdrawal API Route

- [x] 7.1 Replace `web/src/app/api/wallet/withdraw/route.ts` — authenticates user, reads amount and destinationAddress from body, calls `paymentService.initiateWithdrawal()`, returns withdrawal status and details. Remove all mock/demo withdrawal logic

## Task 8: Replace Deposit API Route

- [x] 8.1 Remove or repurpose `web/src/app/api/wallet/deposit/route.ts` — deposits are now webhook-driven, so the manual deposit endpoint should be removed. Optionally keep as a no-op that returns an error directing users to send crypto to their deposit address

## Task 9: Update Wallet Page UI

- [x] 9.1 Replace `web/src/app/wallet/actions.tsx` — split into deposit tab (shows address, QR code, minimum notice, supported currencies) and withdrawal tab (form with amount, Solana address pre-filled from saved, fee display, daily limit counter, net USDC calculation). Remove all demo/test references and disclaimers
- [x] 9.2 Update `web/src/app/wallet/page.tsx` — fetch deposit address, recent deposits, recent withdrawals, daily withdrawal count, and maintenance mode status. Pass data to updated client components. Add maintenance banner when active. Update transaction history to include deposit and withdrawal records with status indicators
- [x] 9.3 Add QR code generation for the deposit address (use a lightweight QR library or inline SVG generation)

## Task 10: Write Property-Based Tests

- [x] 10.1 Create test file `src/__tests__/crypto-payments.property.test.ts` with fast-check generators for: user profiles, USD values, token amounts, Solana addresses, webhook payloads, withdrawal requests
- [x] 10.2 [PBT] Property 1: Deposit address provisioning idempotency — generate random user IDs, call getOrCreateDepositAddress twice, verify same address returned and API called at most once
- [x] 10.3 [PBT] Property 2: Webhook HMAC signature verification — generate random payloads and secrets, verify valid signatures accepted and invalid signatures rejected
- [x] 10.4 [PBT] Property 3: USD-to-token conversion — generate random USD values, verify tokenAmount = Math.floor(usdValue * 100)
- [x] 10.5 [PBT] Property 4: Webhook processing idempotency — generate random confirmed webhooks, process N times, verify balance credited exactly once
- [x] 10.6 [PBT] Property 5: Deposit status transitions and minimum enforcement — generate webhooks with varying statuses and USD values, verify correct status transitions and credit/no-credit behavior
- [x] 10.7 [PBT] Property 6: Withdrawal validation — generate random (amount, balance, address, dailyCount) tuples, verify acceptance iff all four conditions hold
- [x] 10.8 [PBT] Property 7: Withdrawal balance deduction — generate valid withdrawals, verify balance decreases by amount + fee and two transaction records created
- [x] 10.9 [PBT] Property 8: Failed withdrawal full refund — generate random failed withdrawals, verify balance restored by amount + fee, net effect is zero
- [x] 10.10 [PBT] Property 9: Withdrawal address persistence — generate sequences of addresses, verify saved address always equals the last one used
- [x] 10.11 [PBT] Property 10: Maintenance mode behavior — generate sets of webhooks and withdrawal requests during maintenance, verify deposits queued and withdrawals rejected, then process queue and verify all credited
- [x] 10.12 [PBT] Property 11: Transaction audit trail completeness — generate sequences of deposits and withdrawals, verify every balance change has a corresponding transaction record and sum matches

## Task 11: Write Unit Tests

- [x] 11.1 Create test file `src/__tests__/crypto-payments.unit.test.ts` with example-based tests for: API failure error messages, webhook audit logging, sub-minimum deposit logging, rate limit error message with reset time, missing env var graceful degradation, withdrawal fee transaction label, Solana address edge cases (empty string, too short, too long, invalid characters)
