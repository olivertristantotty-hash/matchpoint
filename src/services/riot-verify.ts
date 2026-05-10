/**
 * Riot account verification via the "summoner icon" trick.
 *
 * Flow:
 *   1. User submits Riot ID (Name#TAG) + region
 *   2. We resolve the PUUID via account-v1 and their current profile icon via summoner-v4
 *   3. We pick a random target icon (from the default free set) that's different from their current
 *   4. We ask them to change their summoner icon in-client to the target
 *   5. They click Verify. We re-fetch summoner-v4 and check profileIconId matches target
 *   6. If match, we've proven they control that Riot account (nobody else could change its icon)
 *
 * Why this works:
 *   - Only the account owner can change its profile icon (requires authenticated client)
 *   - Target icon is random (32+ options) and one-time, so no guessing
 *   - Used in production by dorans.bot, LoLAccountVerifierBot, and others
 *
 * Limits:
 *   - Requires a League of Legends profile on the chosen region. Pure Valorant accounts
 *     without LoL may not have one until they launch LoL once.
 *   - Riot dev keys rate-limit at 100 req / 2 min. Fine for a handful of verifications.
 *     For production scale, a production key is required (free, requires approval).
 */

const RIOT_API_KEY = process.env.RIOT_API_KEY ?? "";

// Accounts endpoint is global — any of the three regional routing hosts works.
const ACCOUNT_ROUTING = "americas";

// Map user-facing region codes to Riot's platform routing values.
const PLATFORM_MAP: Record<string, string> = {
  na:   "na1",
  euw:  "euw1",
  eune: "eun1",
  kr:   "kr",
  jp:   "jp1",
  br:   "br1",
  lan:  "la1",
  las:  "la2",
  oce:  "oc1",
  ru:   "ru",
  tr:   "tr1",
};

export const SUPPORTED_REGIONS = Object.keys(PLATFORM_MAP);

// Default profile icons are IDs 0–28 — available to every account on login.
// Pick from this set so the user doesn't need to own any skins to verify.
const AVAILABLE_ICONS = Array.from({ length: 29 }, (_, i) => i);

// Data Dragon version for icon image URLs. Default icons exist in every version;
// hardcoding a recent stable version is safer than fetching the version list on
// every verification.
const DDRAGON_VERSION = "14.1.1";

// Verification TTL — users have this long to change their icon.
const TTL_MS = 10 * 60 * 1000;

interface RiotPending {
  userId: string;
  puuid: string;
  riotId: string;          // "Name#TAG"
  region: string;          // normalized key like "na"
  platform: string;        // Riot platform routing value like "na1"
  originalIconId: number;
  targetIconId: number;
  expiresAt: number;
}

const pending = new Map<string, RiotPending>();

export function normalizeRegion(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (PLATFORM_MAP[lower]) return lower;
  // Accept platform values too (e.g. "euw1" → "euw")
  for (const [key, platform] of Object.entries(PLATFORM_MAP)) {
    if (platform === lower) return key;
  }
  return null;
}

export type RiotStartResult =
  | {
      success: true;
      puuid: string;
      riotId: string;
      targetIconId: number;
      iconUrl: string;
    }
  | { success: false; error: string };

export async function startRiotVerification(
  userId: string,
  riotId: string,
  regionInput: string,
): Promise<RiotStartResult> {
  if (!RIOT_API_KEY) {
    return { success: false, error: "Riot API isn't configured. Tell an admin." };
  }

  // Parse "Name#TAG"
  const hashIdx = riotId.indexOf("#");
  if (hashIdx < 1 || hashIdx === riotId.length - 1) {
    return { success: false, error: "Riot ID must look like `Name#TAG` (e.g. Faker#KR1)." };
  }
  const gameName = riotId.slice(0, hashIdx).trim();
  const tagLine = riotId.slice(hashIdx + 1).trim();

  const region = normalizeRegion(regionInput);
  if (!region) {
    return {
      success: false,
      error: `Unknown region \`${regionInput}\`. Try one of: ${SUPPORTED_REGIONS.join(", ")}`,
    };
  }
  const platform = PLATFORM_MAP[region];

  // Step 1: resolve PUUID from Riot ID via account-v1 (global)
  const accountUrl = `https://${ACCOUNT_ROUTING}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  let accountRes: Response;
  try {
    accountRes = await fetch(accountUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
  } catch (err: any) {
    return { success: false, error: `Network error talking to Riot: ${err.message}` };
  }

  if (accountRes.status === 404) {
    return { success: false, error: `Riot ID \`${gameName}#${tagLine}\` not found. Double-check spelling and tag.` };
  }
  if (accountRes.status === 401 || accountRes.status === 403) {
    return { success: false, error: "Riot API key is unauthorized. An admin needs to refresh it." };
  }
  if (accountRes.status === 429) {
    return { success: false, error: "Riot API is rate-limiting us. Try again in a minute." };
  }
  if (!accountRes.ok) {
    return { success: false, error: `Riot API error (${accountRes.status}). Try again.` };
  }

  const account = (await accountRes.json()) as { puuid: string; gameName: string; tagLine: string };

  // Step 2: fetch current profile icon from summoner-v4 on the platform they picked
  const summonerUrl = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`;
  const summRes = await fetch(summonerUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });

  if (summRes.status === 404) {
    return {
      success: false,
      error: `No League of Legends profile on **${region.toUpperCase()}** for this Riot account. If you only play Valorant, launch LoL once to create a profile, or pick the region you actually played LoL on.`,
    };
  }
  if (!summRes.ok) {
    return { success: false, error: `Riot API error (${summRes.status}) fetching summoner.` };
  }

  const summoner = (await summRes.json()) as { profileIconId: number };

  // Step 3: pick a target icon that's different from current
  const candidates = AVAILABLE_ICONS.filter((id) => id !== summoner.profileIconId);
  const target = candidates[Math.floor(Math.random() * candidates.length)];

  pending.set(userId, {
    userId,
    puuid: account.puuid,
    riotId: `${account.gameName}#${account.tagLine}`,
    region,
    platform,
    originalIconId: summoner.profileIconId,
    targetIconId: target,
    expiresAt: Date.now() + TTL_MS,
  });

  return {
    success: true,
    puuid: account.puuid,
    riotId: `${account.gameName}#${account.tagLine}`,
    targetIconId: target,
    iconUrl: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${target}.png`,
  };
}

export function getRiotPending(userId: string): RiotPending | null {
  const p = pending.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pending.delete(userId);
    return null;
  }
  return p;
}

export function clearRiotPending(userId: string): void {
  pending.delete(userId);
}

export interface RiotCheckResult {
  matched: boolean;
  currentIconId: number;
  targetIconId: number;
  puuid: string;
  riotId: string;
}

export async function checkRiotVerification(userId: string): Promise<RiotCheckResult | null> {
  const p = getRiotPending(userId);
  if (!p) return null;

  const summonerUrl = `https://${p.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${p.puuid}`;
  const res = await fetch(summonerUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
  if (!res.ok) return null;

  const data = (await res.json()) as { profileIconId: number };
  return {
    matched: data.profileIconId === p.targetIconId,
    currentIconId: data.profileIconId,
    targetIconId: p.targetIconId,
    puuid: p.puuid,
    riotId: p.riotId,
  };
}
