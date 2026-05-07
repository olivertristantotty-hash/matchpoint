import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been deprecated. Deposits are now handled by sending crypto directly to your deposit address. Visit /wallet to view your deposit address.",
    },
    { status: 410 },
  );
}
