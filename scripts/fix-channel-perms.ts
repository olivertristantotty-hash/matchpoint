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
  if (!res.ok) console.error(`${method} ${path}: ${res.status}`);
  return res.ok;
}

async function main() {
  const channels = await (await fetch(`${API}/guilds/${GUILD_ID}/channels`, { headers })).json() as any[];

  // Channels that users should be able to type in
  const openChannels = ["find-match", "free-play", "general"];

  // Permission bits
  const VIEW_CHANNEL = 1n << 10n;
  const SEND_MESSAGES = 1n << 11n;
  const ATTACH_FILES = 1n << 15n;
  const READ_HISTORY = 1n << 16n;

  const allow = (VIEW_CHANNEL | SEND_MESSAGES | ATTACH_FILES | READ_HISTORY).toString();

  for (const name of openChannels) {
    const ch = channels.find((c: any) => c.type === 0 && c.name === name);
    if (!ch) { console.log(`Not found: #${name}`); continue; }

    const ok = await api("PUT", `/channels/${ch.id}/permissions/${GUILD_ID}`, {
      id: GUILD_ID,
      type: 0,
      allow,
      deny: "0",
    });

    console.log(`${ok ? "✅" : "❌"} #${name} → open for everyone`);
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
