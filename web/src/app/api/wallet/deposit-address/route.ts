import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getCurrentUser, userPaymentProfiles } from "@/lib/user";

// ── GET handler ──

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY ?? "";
  const NOWPAYMENTS_API_URL =
    process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1";

  if (!NOWPAYMENTS_API_KEY) {
    return NextResponse.json(
      { error: "Crypto payments are not configured" },
      { status: 503 },
    );
  }

  try {
    // Check for existing deposit address
    const [profile] = await db
      .select()
      .from(userPaymentProfiles)
      .where(eq(userPaymentProfiles.userId, user.id));

    if (profile?.nowpaymentsDepositAddress) {
      return NextResponse.json({
        address: profile.nowpaymentsDepositAddress,
        currency: "usdcsol",
      });
    }

    // Create a payment via NOWPayments API to get a deposit address
    // Using POST /v1/payment with a large price_amount so the address stays valid
    const res = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
      method: "POST",
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: 1000,
        price_currency: "usd",
        pay_currency: "usdcsol",
        order_id: `deposit-${user.id}`,
        order_description: `Deposit address for user ${user.id}`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[DepositAddress] NOWPayments create payment failed (${res.status}): ${text}`,
      );
      return NextResponse.json(
        { error: `Failed to create deposit address. Please try again. (${res.status})` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { pay_address?: string; payment_id?: string | number };
    console.log("[DepositAddress] NOWPayments response:", JSON.stringify(data));

    if (!data.pay_address) {
      console.error("[DepositAddress] No pay_address in NOWPayments API response:", data);
      return NextResponse.json(
        { error: "Failed to create deposit address. No address returned." },
        { status: 502 },
      );
    }

    // Store the deposit address
    if (profile) {
      await db
        .update(userPaymentProfiles)
        .set({
          nowpaymentsDepositAddress: data.pay_address,
          updatedAt: new Date(),
        })
        .where(eq(userPaymentProfiles.userId, user.id));
    } else {
      await db.insert(userPaymentProfiles).values({
        id: nanoid(),
        userId: user.id,
        nowpaymentsDepositAddress: data.pay_address,
      });
    }

    return NextResponse.json({
      address: data.pay_address,
      currency: "usdcsol",
    });
  } catch (err) {
    console.error("[DepositAddress] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
