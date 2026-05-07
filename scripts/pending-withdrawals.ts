/**
 * List all pending withdrawals that need manual processing.
 * 
 * Usage: npx tsx scripts/pending-withdrawals.ts
 */

import { config } from "dotenv";
config();

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });

async function main() {
  const pending = await sql`
    SELECT w.id, w.token_amount, w.withdrawal_fee, w.usd_value, w.destination_address, w.created_at, u.username
    FROM withdrawals w
    JOIN users u ON u.id = w.user_id
    WHERE w.status = 'pending'
    ORDER BY w.created_at ASC
  `;

  if (pending.length === 0) {
    console.log("\n✅ No pending withdrawals.\n");
    await sql.end();
    return;
  }

  console.log(`\n💸 ${pending.length} pending withdrawal(s):\n`);
  console.log("─".repeat(80));

  for (const w of pending) {
    console.log(`  User:    ${w.username}`);
    console.log(`  Amount:  ${w.token_amount} MP ($${w.usd_value})`);
    console.log(`  Fee:     ${w.withdrawal_fee} MP`);
    console.log(`  Send to: ${w.destination_address}`);
    console.log(`  Date:    ${w.created_at}`);
    console.log(`  ID:      ${w.id}`);
    console.log("─".repeat(80));
  }

  console.log(`\nAfter sending, mark as completed:`);
  console.log(`  npx tsx scripts/pending-withdrawals.ts complete <ID>\n`);

  await sql.end();
}

// Handle "complete" subcommand
const args = process.argv.slice(2);
if (args[0] === "complete" && args[1]) {
  const id = args[1];
  sql`UPDATE withdrawals SET status = 'completed', updated_at = NOW() WHERE id = ${id}`
    .then(() => { console.log(`✅ Withdrawal ${id} marked as completed.`); return sql.end(); })
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}
