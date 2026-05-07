import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { deposits, wallets, transactions, userPaymentProfiles, users } from "@/lib/user";

// ── Config ──

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET ?? "";
const MIN_DEPOSIT_USD = 5.0;

// ── Helpers ──

function verifyWebhookSignature(
  body: Record<string, unknown>,
  signature: string,
): boolean {
  if (!NOWPAYMENTS_IPN_SECRET) return false;

  const sorted = Object.keys(body)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = body[key];
      return acc;
    }, {});

  const hmac = createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
  hmac.update(JSON.stringify(sorted));
  const computed = hmac.digest("hex");

  return computed === signature;
}

function isMaintenanceMode(): boolean {
  const val = process.env.MAINTENANCE_MODE ?? "false";
  return val === "true" || val === "1";
}

// ── POST handler ──

export async function POST(req: NextRequest) {
  // Read raw body as text, then parse
  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC signature
  const signature = req.headers.get("x-nowpayments-sig") ?? "";
  if (!verifyWebhookSignature(body, signature)) {
    console.error(
      `[Webhook] Signature verification failed for payment_id=${body.payment_id}`,
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Process the deposit webhook
  try {
    await processDepositWebhook(body);
  } catch (err) {
    console.error("[Webhook] Error processing deposit webhook:", err);
    // Still return 200 to prevent NOWPayments from retrying
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ── Deposit webhook processing ──

async function processDepositWebhook(
  payload: Record<string, unknown>,
): Promise<void> {
  const paymentId = String(payload.payment_id);
  const status = payload.payment_status as string;
  const payAddress = payload.pay_address ? String(payload.pay_address) : null;
  const txHash = payload.payin_hash ? String(payload.payin_hash) : null;

  console.log(
    `[Webhook] Received: paymentId=${paymentId} status=${status} amount=${payload.outcome_amount ?? payload.price_amount}`,
  );

  // Look up user by deposit address
  let userId: string | null = null;
  if (payAddress) {
    const [profile] = await db
      .select()
      .from(userPaymentProfiles)
      .where(eq(userPaymentProfiles.nowpaymentsDepositAddress, payAddress));
    userId = profile?.userId ?? null;
  }

  if (!userId) {
    console.log(
      `[Webhook] Unknown address ${payAddress}, paymentId=${paymentId} — skipping`,
    );
    return;
  }

  // Check for existing deposit record (idempotency)
  const [existing] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.nowpaymentsPaymentId, paymentId));

  const usdValue = payload.outcome_amount
    ? String(payload.outcome_amount)
    : payload.price_amount
      ? String(payload.price_amount)
      : null;

  if (status === "confirming") {
    if (existing) {
      await db
        .update(deposits)
        .set({
          status: "confirming",
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : existing.sourceCurrency,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : existing.sourceAmount,
          usdValue: usdValue ?? existing.usdValue,
          updatedAt: new Date(),
        })
        .where(eq(deposits.id, existing.id));
    } else {
      await db.insert(deposits).values({
        id: nanoid(),
        userId,
        nowpaymentsPaymentId: paymentId,
        sourceCurrency: payload.pay_currency
          ? String(payload.pay_currency)
          : null,
        sourceAmount: payload.actually_paid
          ? String(payload.actually_paid)
          : null,
        usdValue,
        status: "confirming",
      });
    }
    return;
  }

  if (status === "confirmed" || status === "finished") {
    const usdNum = usdValue ? parseFloat(usdValue) : 0;
    const tokenAmount = Math.floor(usdNum * 100);

    if (existing) {
      // Already credited? Skip
      if (existing.credited === 1) {
        console.log(
          `[Webhook] Deposit ${paymentId} already credited — skipping`,
        );
        return;
      }

      // Check minimum
      if (usdNum < MIN_DEPOSIT_USD) {
        console.log(
          `[Webhook] Sub-minimum deposit: userId=${userId} paymentId=${paymentId} usdValue=${usdNum}`,
        );
        await db
          .update(deposits)
          .set({
            status: "confirmed",
            usdValue: usdValue ?? existing.usdValue,
            tokenAmount,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, existing.id));
        return;
      }

      // Maintenance mode — queue instead of crediting
      if (isMaintenanceMode()) {
        await db
          .update(deposits)
          .set({
            status: "confirmed",
            usdValue: usdValue ?? existing.usdValue,
            tokenAmount,
            maintenanceQueued: 1,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, existing.id));
        return;
      }

      // Credit balance
      await creditDeposit(userId, tokenAmount, existing.id);
      await db
        .update(deposits)
        .set({
          status: "confirmed",
          usdValue: usdValue ?? existing.usdValue,
          tokenAmount,
          credited: 1,
          txHash: txHash ?? existing.txHash,
          updatedAt: new Date(),
        })
        .where(eq(deposits.id, existing.id));
    } else {
      // New deposit record
      const depositId = nanoid();

      if (usdNum < MIN_DEPOSIT_USD) {
        console.log(
          `[Webhook] Sub-minimum deposit: userId=${userId} paymentId=${paymentId} usdValue=${usdNum}`,
        );
        await db.insert(deposits).values({
          id: depositId,
          userId,
          nowpaymentsPaymentId: paymentId,
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : null,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : null,
          usdValue,
          tokenAmount,
          status: "confirmed",
        });
        return;
      }

      if (isMaintenanceMode()) {
        await db.insert(deposits).values({
          id: depositId,
          userId,
          nowpaymentsPaymentId: paymentId,
          sourceCurrency: payload.pay_currency
            ? String(payload.pay_currency)
            : null,
          sourceAmount: payload.actually_paid
            ? String(payload.actually_paid)
            : null,
          usdValue,
          tokenAmount,
          status: "confirmed",
          maintenanceQueued: 1,
        });
        return;
      }

      await db.insert(deposits).values({
        id: depositId,
        userId,
        nowpaymentsPaymentId: paymentId,
        sourceCurrency: payload.pay_currency
          ? String(payload.pay_currency)
          : null,
        sourceAmount: payload.actually_paid
          ? String(payload.actually_paid)
          : null,
        usdValue,
        tokenAmount,
        status: "confirmed",
        credited: 1,
        txHash,
      });
      await creditDeposit(userId, tokenAmount, depositId);
    }
    return;
  }

  if (status === "failed" || status === "expired") {
    if (existing) {
      await db
        .update(deposits)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(deposits.id, existing.id));
    } else {
      await db.insert(deposits).values({
        id: nanoid(),
        userId,
        nowpaymentsPaymentId: paymentId,
        sourceCurrency: payload.pay_currency
          ? String(payload.pay_currency)
          : null,
        sourceAmount: payload.actually_paid
          ? String(payload.actually_paid)
          : null,
        usdValue,
        status: "failed",
      });
    }
    return;
  }
}

// ── Credit deposit to user balance ──

async function creditDeposit(
  userId: string,
  tokenAmount: number,
  depositId: string,
): Promise<void> {
  await db
    .update(wallets)
    .set({
      available: sql`${wallets.available} + ${tokenAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, userId));

  await db.insert(transactions).values({
    id: nanoid(),
    userId,
    type: "deposit_credit",
    amount: tokenAmount,
    description: `Crypto deposit credited (deposit: ${depositId})`,
  });

  // Send Discord DM notification
  await notifyDepositOnDiscord(userId, tokenAmount);
}

// ── Discord DM notification ──

async function notifyDepositOnDiscord(
  userId: string,
  mpAmount: number,
): Promise<void> {
  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  if (!DISCORD_TOKEN) return;

  try {
    // Look up user's discordId
    const [user] = await db
      .select({ discordId: users.discordId })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.discordId) return;

    // Create DM channel
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: user.discordId }),
    });

    if (!dmRes.ok) return;
    const dmChannel = (await dmRes.json()) as { id: string };

    // Send the deposit notification
    const usdValue = (mpAmount / 100).toFixed(2);
    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{
          title: "💰 Deposit Confirmed",
          description: `Your deposit has been confirmed and credited to your wallet.`,
          color: 0x27ae60,
          fields: [
            { name: "Amount", value: `**${mpAmount.toLocaleString()} MP** ($${usdValue})`, inline: true },
          ],
          footer: { text: "MATCHPOINT" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err) {
    console.error("[Webhook] Failed to send Discord deposit notification:", err);
  }
}
