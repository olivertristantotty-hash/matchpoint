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

    // Also grant @Good (default tier) so they show in sidebar correctly
    const goodRole = roles.find((r) => r.name === "Good");
    if (goodRole) {
      await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${goodRole.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "X-Audit-Log-Reason": "Default tier on verification",
          },
        },
      );
    }

    // DM the user with the game picker
    try {
      // Create DM channel
      const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient_id: discordUserId }),
      });

      if (dmRes.ok) {
        const dm = await dmRes.json() as { id: string };

        // Send game picker message
        await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: "✅ **You're verified!** Now pick the games you play to unlock their channels:",
            components: [
              {
                type: 1, // ActionRow
                components: [
                  {
                    type: 3, // StringSelect
                    custom_id: "vgame_pick",
                    placeholder: "Select games you play…",
                    min_values: 1,
                    max_values: 9,
                    options: [
                      { label: "Valorant", value: "valorant", description: "Riot 1v1 customs", emoji: { name: "🎯" } },
                      { label: "League of Legends", value: "lol", description: "Summoner's Rift 1v1", emoji: { name: "🗡️" } },
                      { label: "Call of Duty", value: "cod", description: "BO6, MW3, Warzone", emoji: { name: "🔫" } },
                      { label: "EA FC / FIFA", value: "fifa", description: "Online Friendlies", emoji: { name: "⚽" } },
                      { label: "Fortnite", value: "fortnite", description: "Box Fight / Zone Wars", emoji: { name: "🏆" } },
                      { label: "Rocket League", value: "rocketleague", description: "Private match 1v1", emoji: { name: "🚗" } },
                      { label: "NBA 2K", value: "nba2k", description: "Play Now Online", emoji: { name: "🏀" } },
                      { label: "Madden NFL", value: "madden", description: "Head to Head", emoji: { name: "🏈" } },
                      { label: "Mario Kart", value: "mariokart", description: "VS Race", emoji: { name: "🏁" } },
                    ],
                  },
                ],
              },
            ],
          }),
        });
      }
    } catch (dmErr: any) {
      // DM might fail if user has DMs disabled — non-fatal
      console.error("[Verify/Grant] DM failed:", dmErr.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Verify/Grant] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
