/**
 * Uploads game logos as Application Emojis.
 * Writes IDs to scripts/assets/games/emoji-ids.json.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
const ASSETS_DIR = resolve(import.meta.dirname ?? ".", "assets/games");
const EMOJI_IDS_PATH = resolve(ASSETS_DIR, "emoji-ids.json");

const GAMES = [
  { key: "valorant",      emojiName: "mp_valorant",      file: "valorant.png" },
  { key: "lol",           emojiName: "mp_lol",           file: "lol.png" },
  { key: "cod",           emojiName: "mp_cod",           file: "cod.png" },
  { key: "fifa",          emojiName: "mp_eafc",          file: "ea-fc.png" },
  { key: "fortnite",      emojiName: "mp_fortnite",      file: "fortnite.png" },
  { key: "rocketleague",  emojiName: "mp_rocketleague",  file: "rocket-league.png" },
  { key: "nba2k",         emojiName: "mp_nba2k",         file: "nba-2k.png" },
  { key: "madden",        emojiName: "mp_madden",        file: "madden.png" },
  { key: "mariokart",     emojiName: "mp_mariokart",     file: "mario-kart.png" },
];

const MAX_BYTES = 256 * 1024;

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const app = client.application!;
  const existing = await app.emojis.fetch();

  const idMap: Record<string, string> = existsSync(EMOJI_IDS_PATH)
    ? JSON.parse(readFileSync(EMOJI_IDS_PATH, "utf8"))
    : {};

  console.log("\n── Uploading Game Emojis ──\n");
  let uploaded = 0;
  const missing: string[] = [];

  for (const g of GAMES) {
    const filePath = resolve(ASSETS_DIR, g.file);

    if (!existsSync(filePath)) {
      missing.push(g.file);
      continue;
    }

    const size = statSync(filePath).size;
    if (size > MAX_BYTES) {
      console.log(`  ✗ ${g.file} too large (${Math.round(size / 1024)} KB)`);
      continue;
    }

    const already = existing.find((e) => e.name === g.emojiName);
    if (already) {
      idMap[g.key] = already.id;
      console.log(`  ⏭ ${g.emojiName} exists (${already.id})`);
      continue;
    }

    try {
      const buffer = readFileSync(filePath);
      const emoji = await app.emojis.create({ name: g.emojiName, attachment: buffer });
      idMap[g.key] = emoji.id;
      console.log(`  ✓ ${g.emojiName} → ${emoji.id}`);
      uploaded++;
    } catch (err: any) {
      console.log(`  ✗ ${g.file}: ${err.message}`);
    }
  }

  if (Object.keys(idMap).length > 0) {
    writeFileSync(EMOJI_IDS_PATH, JSON.stringify(idMap, null, 2));
  }

  console.log(`\n✅ Uploaded: ${uploaded}`);
  if (missing.length > 0) {
    console.log(`⚠  Missing: ${missing.join(", ")}`);
  }

  await client.destroy();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
