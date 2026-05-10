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
  const gamesParam = req.nextUrl.searchParams.get("games") ?? "";
  const selectedGames = gamesParam.split(",").filter(Boolean);

  if (!discordUserId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  if (!BOT_TOKEN || !GUILD_ID) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  try {
    // Fetch all roles
    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    if (!rolesRes.ok) {
      return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
    }

    const roles: { id: string; name: string }[] = await rolesRes.json();
    const verifiedRole = roles.find((r) => r.name === "Verified");
    const goodRole = roles.find((r) => r.name === "Good");

    if (!verifiedRole) {
      return NextResponse.json({ error: "@Verified role not found" }, { status: 500 });
    }

    // Grant @Verified
    await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${verifiedRole.id}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Passed connection verification" },
      },
    );

    // Grant @Good (default tier)
    if (goodRole) {
      await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${goodRole.id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Default tier on verification" },
        },
      );
    }

    // Grant game roles
    const GAME_ROLE_MAP: Record<string, string> = {
      valorant: "Valorant", lol: "LoL", cod: "Call of Duty", fifa: "EA FC",
      fortnite: "Fortnite", rocketleague: "Rocket League", nba2k: "NBA 2K",
      madden: "Madden", mariokart: "Mario Kart",
    };

    for (const gameKey of selectedGames) {
      const roleName = GAME_ROLE_MAP[gameKey];
      if (!roleName) continue;
      const gameRole = roles.find((r) => r.name === roleName);
      if (!gameRole) continue;

      await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${gameRole.id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": `Game selected: ${roleName}` },
        },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Verify/Grant] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
