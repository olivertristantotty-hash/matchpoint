/**
 * Manual Deposit Credit Script
 * 
 * Use this when you've sent crypto to your deposit address but the webhook
 * hasn't fired (e.g., IPN URL not set up yet, or running locally).
 * 
 * Checks NOWPayments for recent payments to your deposit address and credits them.
 * 
 * Usage: npx tsx scripts/manual-credit-deposit.ts
 */

import { config } from "dotenv";
config();

import { eq, and, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import * as schema from "../src/db/schema.js";

const client = postgres(process.env.DATABASE_URL!, { ssl: "require" });
const db = drizzle(client, { schema });

const { users, wallets, deposits, transactions, userPaymentProfiles } = schema;

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY!;
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1";

async function main() {
  console.log("\n💰 Manual Deposit Credit Tool\n");

  // List all users with deposit addresses
  const profiles = await db
    .select({
      userId: userPaymentProfiles.userId,
      address: userPaymentProfiles.nowpaymentsDepositAddress,
    })
    .from(userPaymentProfiles)
    .where(sql`${userPaymentProfiles.nowpaymentsDepositAddress} IS NOT NULL`);

  if (profiles.length === 0) {
    console.log("No users have deposit addresses yet.");
    console.log("Generate one by visiting /wallet on the web app, or run:");
    console.log("  npx tsx scripts/e2e-test-payments.ts");
    await client.end();
    return;
  }

  console.log("Users with deposit addresses:");
  for (const p of profiles) {
    const [user] = await db.select().from(users).where(eq(users.id, p.userId));
    console.log(`  ${user?.username ?? "unknown"} → ${p.address}`);
  }

  // Check NOWPayments for recent payments
  console.log("\n🔍 Checking NOWPayments for recent payments...\n");

  try {
    const res = await fetch(`${NOWPAYMENTS_API_URL}/payment/?limit=20&orderBy=created_at&sortBy=desc`, {
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
    });

    if (!res.ok) {
      const text = await res.text();
      console.log(`NOWPayments API returned ${res.status}: ${text}`);
      console.log("\nAlternative: manually credit a deposit below.\n");
    } else {
      const data = (await res.json()) as { data?: any[] };
      const payments = data.data ?? [];

      if (payments.length === 0) {
        console.log("No recent payments found on NOWPayments.");
      } else {
        console.log(`Found ${payments.length} recent payments:\n`);
        for (const p of payments.slice(0, 10)) {
          const status = p.payment_status;
          const amount = p.actually_paid || p.pay_amount || "?";
          const address = p.pay_address || "?";
          const paymentId = p.payment_id;
          console.log(`  #${paymentId} | ${status} | ${amount} ${p.pay_currency ?? ""} → ${address}`);

          // If confirmed/finished and not yet credited, offer to credit
          if ((status === "confirmed" || status === "finished") && address) {
            const profile = profiles.find(pr => pr.address === address);
            if (profile) {
              // Check if already credited
              const [existing] = await db
                .select()
                .from(deposits)
                .where(eq(deposits.nowpaymentsPaymentId, String(paymentId)));

              if (existing?.credited === 1) {
                console.log(`    ✓ Already credited`);
              } else {
                const usdValue = p.outcome_amount || p.price_amount || 0;
                const tokenAmount = Math.floor(parseFloat(usdValue) * 100);
                console.log(`    → Ready to credit: ${tokenAmount} MP ($${usdValue}) to ${profile.userId}`);

                // Credit it
                const depositId = existing?.id ?? nanoid();
                if (!existing) {
                  await db.insert(deposits).values({
                    id: depositId,
                    userId: profile.userId,
                    nowpaymentsPaymentId: String(paymentId),
                    sourceCurrency: p.pay_currency ?? null,
                    sourceAmount: p.actually_paid ? String(p.actually_paid) : null,
                    usdValue: String(usdValue),
                    tokenAmount,
                    status: "confirmed",
                    credited: 1,
                  });
                } else {
                  await db.update(deposits)
                    .set({ credited: 1, tokenAmount, status: "confirmed", updatedAt: new Date() })
                    .where(eq(deposits.id, existing.id));
                }

                await db.update(wallets)
                  .set({ available: sql`${wallets.available} + ${tokenAmount}`, updatedAt: new Date() })
                  .where(eq(wallets.userId, profile.userId));

                await db.insert(transactions).values({
                  id: nanoid(),
                  userId: profile.userId,
                  type: "deposit_credit",
                  amount: tokenAmount,
                  description: `Manual credit: crypto deposit ${depositId}`,
                });

                const [user] = await db.select().from(users).where(eq(users.id, profile.userId));
                console.log(`    ✅ Credited ${tokenAmount} MP to ${user?.username ?? profile.userId}!`);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error checking NOWPayments:", (err as Error).message);
  }

  // Show final balances
  console.log("\n── Current Balances ──");
  const allWallets = await db
    .select({ userId: wallets.userId, available: wallets.available, escrowed: wallets.escrowed })
    .from(wallets);

  for (const w of allWallets) {
    const [user] = await db.select().from(users).where(eq(users.id, w.userId));
    if (user) {
      console.log(`  ${user.username}: ${w.available} MP available, ${w.escrowed} MP escrowed`);
    }
  }

  console.log("\n");
  await client.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
