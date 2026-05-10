/**
 * GET /api/verify/grant?user=<discord_user_id>
 *
 * Called after successful verification to grant the @Verified role via the bot token.
 * This runs server-side so the bot token stays secret.
 */
import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID ?? "";

export async function GET(req: NextRequest) {
  const discordUserId = req.nextUrl.searchParams.get("user");
  if (!discordUserId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  if (!BOT_TOKEN || !GUILD_ID) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  try {
    // Find the @Verified role
    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    if (!rolesRes.ok) {
      return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
    }

    const roles: { id: string; name: string }[] = await rolesRes.json();
    const verifiedRole = roles.find((r) => r.name === "Verified");

    if (!verifiedRole) {
      return NextResponse.json({ error: "@Verified role not found" }, { status: 500 });
    }

    // Grant the role
    const grantRes = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${verifiedRole.id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "X-Audit-Log-Reason": "Passed connection verification",
        },
      },
    );

    if (!grantRes.ok && grantRes.status !== 204) {
      const err = await grantRes.text();
      console.error("[Verify/Grant] Failed:", err);
      return NextResponse.json({ error: "Failed to grant role" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Verify/Grant] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
