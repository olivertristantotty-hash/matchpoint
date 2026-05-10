/**
 * GET /api/verify/callback?code=<auth_code>&state=<discord_user_id>
 *
 * Discord redirects here after the user authorizes.
 * We exchange the code for a token, fetch their connections,
 * check if any match our required platforms, and store the result.
 *
 * The bot polls the DB to see if verification completed and grants @Verified.
 */
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { gameAccounts, users } from "@/lib/user";

const CLIENT_ID = process.env.AUTH_DISCORD_ID!;
const CLIENT_SECRET = process.env.AUTH_DISCORD_SECRET!;
const REDIRECT_URI = `${process.env.NEXTAUTH_URL ?? "https://matchpoint-rho-ten.vercel.app"}/api/verify/callback`;

// Discord connection type strings that count as valid gaming platforms
const ACCEPTED_PLATFORMS = new Set([
  "battlenet",     // Battle.net
  "epicgames",     // Epic Games
  "leagueoflegends", // League of Legends (separate from riotgames)
  "playstation",   // PlayStation Network
  "riotgames",     // Riot Games
  "steam",         // Steam
  "xbox",          // Xbox
]);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const rawState = req.nextUrl.searchParams.get("state") ?? "";

  // State format: "discordUserId:game1,game2,game3" or just "discordUserId"
  const [discordUserId, gamesStr] = rawState.split(":");
  const selectedGames = gamesStr ? gamesStr.split(",").filter(Boolean) : [];

  if (!code || !discordUserId) {
    return renderResult(false, "Missing authorization code or state. Try again from Discord.");
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[Verify] Token exchange failed:", err);
      return renderResult(false, "Discord authorization failed. Try again.");
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (err: any) {
    console.error("[Verify] Token exchange error:", err.message);
    return renderResult(false, "Network error. Try again.");
  }

  // Fetch user's connections
  let connections: { type: string; name: string; id: string; verified: boolean }[];
  try {
    const connRes = await fetch("https://discord.com/api/v10/users/@me/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!connRes.ok) {
      return renderResult(false, "Couldn't read your connections. Make sure you authorized the request.");
    }

    connections = await connRes.json();
  } catch (err: any) {
    console.error("[Verify] Connections fetch error:", err.message);
    return renderResult(false, "Network error fetching connections.");
  }

  // Check if any connection matches our accepted platforms
  const matched = connections.filter((c) => ACCEPTED_PLATFORMS.has(c.type));

  if (matched.length === 0) {
    const platformList = [
      "Riot Games", "League of Legends", "Steam", "Xbox",
      "PlayStation", "Epic Games", "Battle.net",
    ].join(", ");

    return renderResult(
      false,
      `No gaming accounts found on your Discord profile.\n\nGo to Discord Settings → Connections and link one of: ${platformList}.\n\nThen come back and click Verify again.`,
    );
  }

  // Store the verified connections in our DB
  // First ensure the user exists
  const { eq } = await import("drizzle-orm");
  const [existingUser] = await db.select().from(users).where(eq(users.discordId, discordUserId));

  if (existingUser) {
    // Save each matched connection as a game account
    for (const conn of matched) {
      await db.insert(gameAccounts)
        .values({
          id: nanoid(),
          userId: existingUser.id,
          platform: conn.type,
          platformUserId: conn.id,
          platformUsername: conn.name,
        })
        .onConflictDoUpdate({
          target: [gameAccounts.userId, gameAccounts.platform],
          set: {
            platformUserId: conn.id,
            platformUsername: conn.name,
            linkedAt: new Date(),
          },
        });
    }
  }

  // Store a verification flag that the bot can read
  // We'll use a simple approach: write a record the bot polls for
  // For now, store in a cookie/param that the success page can show
  const linkedNames = matched.map((c) => `${c.type}: ${c.name}`).join(", ");

  // Revoke the token immediately — we don't need ongoing access
  try {
    await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        token: accessToken,
      }),
    });
  } catch {}

  return renderResult(true, `Verified! Found: ${linkedNames}`, discordUserId, selectedGames);
}

function renderResult(success: boolean, message: string, discordUserId?: string, games?: string[]) {
  const color = success ? "#2ECC71" : "#E74C3C";
  const icon = success ? "✅" : "❌";
  const title = success ? "Verification Complete" : "Verification Failed";
  const gamesParam = games && games.length > 0 ? `&games=${games.join(",")}` : "";

  // Simple HTML page that tells the user the result and they can close the tab
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — MATCHPOINT</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0A0A0E;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .card {
      background: #141418;
      border: 1px solid #2a2a30;
      border-radius: 12px;
      padding: 2.5rem;
      max-width: 480px;
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: ${color}; }
    p { color: #aaa; line-height: 1.6; white-space: pre-line; }
    .note { margin-top: 1.5rem; font-size: 0.85rem; color: #666; }
    ${success ? `.grant-note { margin-top: 1rem; padding: 0.75rem; background: #1a2e1a; border: 1px solid #2ECC71; border-radius: 8px; color: #2ECC71; font-size: 0.9rem; }` : ""}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message.replace(/\n/g, "<br>")}</p>
    ${success ? `<div class="grant-note">Go back to Discord — your game channels will appear within seconds.</div>` : ""}
    <p class="note">You can close this tab.</p>
  </div>
  ${success && discordUserId ? `<script>fetch('/api/verify/grant?user=${discordUserId}${gamesParam}').catch(()=>{})</script>` : ""}
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
