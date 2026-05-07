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
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const channels = await api("GET", `/guilds/${GUILD_ID}/channels`) as any[];
  const ch = channels.find((c: any) => c.type === 0 && c.name === "commands");
  if (!ch) { console.log("No #commands channel"); process.exit(1); }
  console.log("Found #commands:", ch.id);

  const msgs = await api("GET", `/channels/${ch.id}/messages?limit=50`) as any[];
  for (const m of msgs) {
    try { await api("DELETE", `/channels/${ch.id}/messages/${m.id}`); } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(`Cleared ${msgs.length} messages`);

  await api("POST", `/channels/${ch.id}/messages`, {
    content: [
      "# Commands",
      "",
      "`/daily` — Claim 1,000 free FP (every 24h)",
      "`/balance` — Check your balance",
      "`/reputation` — Check your rep and tier",
      "`/leaderboard` — View top players",
      "`/history` — Your recent matches",
      "`/link platform username` — Link a game account",
      "",
      "**Deposit / Withdraw** — use the website: matchpoint-rho-ten.vercel.app/wallet",
      "",
      "---",
      "",
      "Everything else (challenging, accepting, reporting) is done through **right-click menus** and **buttons**. No commands needed.",
    ].join("\n"),
  });

  console.log("✅ Done");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
