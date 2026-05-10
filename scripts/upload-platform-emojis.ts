/**
 * Uploads platform logos as Application Emojis on the bot's Discord application.
 *
 * Application Emojis:
 *   - Attached to your bot, NOT to a specific guild
 *   - Don't count against the 50 guild-emoji cap
 *   - Usable anywhere the bot posts, including buttons
 *   - Referenced in messages as <:name:id> (static) or <a:name:id> (animated)
 *
 * Run once (or any time you update a logo). Idempotent — existing emojis
 * are left alone unless the local PNG differs in filename/path.
 *
 * Source files: scripts/assets/platforms/<platform>.png
 *
 * After uploading, emoji IDs are written to scripts/assets/platforms/emoji-ids.json
 * so the verify-gate setup can reference them by ID.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
config({ path: resolve(import.meta.dirname ?? ".", ".env") });
config({ path: resolve(import.meta.dirname ?? ".", "../.env") });

import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;

const ASSETS_DIR = resolve(import.meta.dirname ?? ".", "assets/platforms");
const EMOJI_IDS_PATH = resolve(ASSETS_DIR, "emoji-ids.json");

// Emoji name must match /^[\w]{2,32}$/ — letters, digits, underscore only
const PLATFORMS: { key: string; emojiName: string; file: string }[] = [
  { key: "riot",        emojiName: "mp_riot",        file: "riot.png" },
  { key: "steam",       emojiName: "mp_steam",       file: "steam.png" },
  { key: "xbox",        emojiName: "mp_xbox",        file: "xbox.png" },
  { key: "playstation", emojiName: "mp_playstation", file: "playstation.png" },
  { key: "activision",  emojiName: "mp_activision",  file: "activision.png" },
  { key: "epic",        emojiName: "mp_epic",        file: "epic.png" },
];

const MAX_BYTES = 256 * 1024; // Discord limit

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  const app = client.application;
  if (!app) throw new Error("Bot has no application — token invalid?");

  // Fetch existing application emojis
  const existing = await app.emojis.fetch();
  console.log(`\n── Existing Application Emojis: ${existing.size} ──`);
  for (const [, e] of existing) {
    console.log(`  ${e.name} (${e.id})`);
  }

  // Load any existing id map
  const idMap: Record<string, string> = existsSync(EMOJI_IDS_PATH)
    ? JSON.parse(readFileSync(EMOJI_IDS_PATH, "utf8"))
    : {};

  console.log("\n── Uploading ──");
  let uploaded = 0;
  let skipped = 0;
  const missingFiles: string[] = [];

  for (const p of PLATFORMS) {
    const filePath = resolve(ASSETS_DIR, p.file);

    if (!existsSync(filePath)) {
      missingFiles.push(p.file);
      continue;
    }

    // Check size
    const size = statSync(filePath).size;
    if (size > MAX_BYTES) {
      console.log(`  ✗  ${p.file} is ${Math.round(size / 1024)} KB — Discord max is 256 KB. Skipped.`);
      continue;
    }

    // Already uploaded under this name? skip
    const already = existing.find((e) => e.name === p.emojiName);
    if (already) {
      idMap[p.key] = already.id;
      console.log(`  ⏭  ${p.emojiName} already exists (${already.id})`);
      skipped++;
      continue;
    }

    // Upload
    try {
      const buffer = readFileSync(filePath);
      const emoji = await app.emojis.create({
        name: p.emojiName,
        attachment: buffer,
      });
      idMap[p.key] = emoji.id;
      console.log(`  ✓  Uploaded ${p.emojiName} → ${emoji.id}`);
      uploaded++;
    } catch (err: any) {
      console.log(`  ✗  Failed to upload ${p.file}: ${err.message}`);
    }
  }

  // Persist the id map
  if (Object.keys(idMap).length > 0) {
    writeFileSync(EMOJI_IDS_PATH, JSON.stringify(idMap, null, 2));
    console.log(`\n  → Wrote emoji IDs to ${EMOJI_IDS_PATH}`);
  }

  // Summary
  console.log("\n══════════════════════════════════════");
  console.log(`✅ Uploaded: ${uploaded}, Skipped: ${skipped}`);
  if (missingFiles.length > 0) {
    console.log(`\n⚠  Missing files in ${ASSETS_DIR}:`);
    for (const f of missingFiles) console.log(`   • ${f}`);
    console.log(`\nSee scripts/assets/platforms/README.md for details.`);
  } else {
    console.log("\nNext step: run  npm run setup:verify  to refresh the verify embed with logos.");
  }
  console.log("══════════════════════════════════════\n");

  await client.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
