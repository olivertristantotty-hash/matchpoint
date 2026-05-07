import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const BOT_ID = "1492509011700875285";
const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const channels = await api("GET", `/guilds/${GUILD_ID}/channels`) as any[];
  const existing = channels.find((c: any) => c.type === 0 && c.name === "admin-withdrawals");
  if (existing) { console.log("Already exists:", existing.id); process.exit(0); }

  // Find Admin role
  const roles = await api("GET", `/guilds/${GUILD_ID}/roles`) as any[];
  const adminRole = roles.find((r: any) => r.name === "Admin");

  const overwrites: any[] = [
    { id: GUILD_ID, type: 0, deny: String(1 << 10) }, // hide from everyone
    { id: BOT_ID, type: 1, allow: String((1 << 10) | (1 << 11) | (1 << 14)) }, // bot can see + send
  ];
  if (adminRole) {
    overwrites.push({ id: adminRole.id, type: 0, allow: String((1 << 10) | (1 << 11)) }); // admins can see + send
  }

  const channel = await api("POST", `/guilds/${GUILD_ID}/channels`, {
    name: "admin-withdrawals",
    type: 0,
    topic: "Withdrawal requests. Click 'Mark as Sent' after processing each one.",
    permission_overwrites: overwrites,
  });
  console.log("✅ Created #admin-withdrawals:", channel.id);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
