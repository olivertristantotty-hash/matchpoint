import { nanoid } from "nanoid";

/**
 * Account verification via code-in-bio.
 *
 * Flow:
 * 1. User requests to link → we generate a unique code
 * 2. User puts the code in their Steam profile summary or Xbox bio
 * 3. User clicks "Verify" → we check the profile via public API
 * 4. If code found → verified, account linked
 *
 * Supports: Steam, Xbox
 */

interface PendingVerification {
  userId: string;
  platform: string;
  platformUsername: string;
  code: string;
  expiresAt: number;
}

// In-memory store for pending verifications (expires after 10 min)
const pending = new Map<string, PendingVerification>();

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a verification code for a user */
export function createVerificationCode(userId: string, platform: string, platformUsername: string): string {
  const code = `MP-${nanoid(6).toUpperCase()}`;

  pending.set(`${userId}:${platform}`, {
    userId,
    platform,
    platformUsername,
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
  });

  return code;
}

/** Get the pending verification for a user */
export function getPendingVerification(userId: string, platform: string): PendingVerification | null {
  const key = `${userId}:${platform}`;
  const entry = pending.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pending.delete(key);
    return null;
  }
  return entry;
}

/** Clear a pending verification after success */
export function clearPendingVerification(userId: string, platform: string) {
  pending.delete(`${userId}:${platform}`);
}

/** Check if a Steam profile contains the verification code */
export async function verifySteamProfile(steamId: string, code: string): Promise<boolean> {
  try {
    // Try both URL formats — custom URL and numeric ID
    const urls = [
      `https://steamcommunity.com/id/${steamId}/?xml=1`,
      `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();
        console.log(`[Verify] Checking ${url} for code ${code} — found: ${text.includes(code)}`);
        if (text.includes(code)) return true;
      } catch {}
    }

    return false;
  } catch (err) {
    console.error("[Verify] Steam check failed:", err);
    return false;
  }
}

/** Check if an Xbox profile bio contains the verification code */
export async function verifyXboxProfile(gamertag: string, code: string): Promise<boolean> {
  try {
    // Use the public Xbox profile page to check bio
    // xapi.us requires auth, so we'll scrape the public profile
    const url = `https://www.xbox.com/en-US/Profile?Gamertag=${encodeURIComponent(gamertag)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) return false;
    const text = await res.text();
    return text.includes(code);
  } catch (err) {
    console.error("[Verify] Xbox check failed:", err);
    return false;
  }
}

/** Get instructions for where to put the code per platform */
export function getVerificationInstructions(platform: string, code: string): string {
  switch (platform) {
    case "steam":
      return [
        `**To verify your Steam account:**`,
        `1. Go to your Steam profile → Edit Profile`,
        `2. In the **Summary** box, paste this code anywhere: \`${code}\``,
        `3. Save your profile`,
        `4. Make sure your profile is set to **Public**`,
        `5. Come back and click **Verify** below`,
        `6. You can remove the code after verification`,
        ``,
        `Use your Steam custom URL name or numeric ID from your profile URL.`,
        `Example: \`steamcommunity.com/id/yourname\` → use \`yourname\``,
        `Example: \`steamcommunity.com/profiles/76561198...\` → use the number`,
        ``,
        `Code expires in 10 minutes.`,
      ].join("\n");

    case "xbox":
      return [
        `**To verify your Xbox account:**`,
        `1. Open the Xbox app or go to xbox.com`,
        `2. Go to your profile → Customize → Bio`,
        `3. Paste this code in your bio: \`${code}\``,
        `4. Save your profile`,
        `5. Come back and click **Verify** below`,
        `6. You can remove the code after verification`,
        ``,
        `Code expires in 10 minutes.`,
      ].join("\n");

    default:
      return `Platform "${platform}" doesn't support verified linking. Your username will be saved but not verified.`;
  }
}

/** Whether a platform supports verified linking */
export function supportsVerification(platform: string): boolean {
  return platform === "steam" || platform === "xbox";
}
