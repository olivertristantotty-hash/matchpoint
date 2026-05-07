import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const channels = await api("GET", `/guilds/${GUILD_ID}/channels`) as any[];
  const findMatch = channels.find((c: any) => c.type === 0 && c.name === "find-match");
  const freePlay = channels.find((c: any) => c.type === 0 && c.name === "free-play");

  if (!findMatch || !freePlay) { console.log("Channels not found"); process.exit(1); }

  // Clear and repost #find-match instructions
  const fmMsgs = await api("GET", `/channels/${findMatch.id}/messages?limit=20`) as any[];
  for (const m of fmMsgs) {
    if (m.author?.bot) {
      try { await api("DELETE", `/channels/${findMatch.id}/messages/${m.id}`); } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
  }

  await api("POST", `/channels/${findMatch.id}/messages`, {
    content: [
      "**How to play:**",
      "",
      "**Want to challenge someone specific?**",
      "→ Right-click their name → Apps → **Challenge to Wager**",
      "",
      "**Want to host an open match?**",
      "→ Type `/host` → pick your game, platform, and amount",
      "→ Your lobby appears here — anyone can click Accept",
      "",
      "**Want to join someone else's match?**",
      "→ Scroll down and click **Accept Match** on any open lobby",
      "",
      "That's it. Once both players are in, play your match and report the result.",
    ].join("\n"),
  });
  console.log("✅ Updated #find-match");

  // Clear and repost #free-play instructions
  const fpMsgs = await api("GET", `/channels/${freePlay.id}/messages?limit=20`) as any[];
  for (const m of fpMsgs) {
    if (m.author?.bot) {
      try { await api("DELETE", `/channels/${freePlay.id}/messages/${m.id}`); } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
  }

  await api("POST", `/channels/${freePlay.id}/messages`, {
    content: [
      "**Free Play — no real money, just bragging rights.**",
      "",
      "Use `/daily` to claim 1,000 FP every 24 hours.",
      "",
      "**Challenge someone:**",
      "→ Right-click their name → Apps → **Freeplay Challenge**",
      "",
      "**Host an open match:**",
      "→ Type `/host` in this channel → pick your game and FP amount",
      "→ Anyone can click Accept",
      "",
      "Win to build your reputation. Higher rep = higher real-money limits later.",
    ].join("\n"),
  });
  console.log("✅ Updated #free-play");

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
