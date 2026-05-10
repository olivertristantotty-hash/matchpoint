/**
 * GET /api/verify/start?state=<discord_user_id>
 *
 * Redirects the user to Discord OAuth with the `connections` scope.
 * After they authorize, Discord redirects to /api/verify/callback.
 */
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

const CLIENT_ID = process.env.AUTH_DISCORD_ID!;
const REDIRECT_URI = `${process.env.NEXTAUTH_URL ?? "https://matchpoint-rho-ten.vercel.app"}/api/verify/callback`;

// We need `identify` (to get their Discord user ID) + `connections` (to read linked accounts)
const SCOPES = "identify connections";

export async function GET(req: NextRequest) {
  const discordUserId = req.nextUrl.searchParams.get("state") ?? "";

  if (!discordUserId) {
    return NextResponse.json({ error: "Missing state (Discord user ID)" }, { status: 400 });
  }

  // Build the Discord OAuth2 authorization URL
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state: discordUserId,
    prompt: "consent",
  });

  const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
