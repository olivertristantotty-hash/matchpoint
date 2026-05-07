import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { gameAccounts } from "../db/schema.js";

/**
 * Medal.tv Integration
 *
 * Flow:
 * 1. Player links Medal account (stores Medal user ID)
 * 2. After match, player saves clip (F8 hotkey in Medal)
 * 3. Bot polls Medal API for recent clips from both players
 * 4. Finds clips created after the match start time
 * 5. Grabs thumbnail (last frame) for score verification
 * 6. Attaches clip URLs to the wager record
 *
 * API: https://developers.medal.tv
 * Wrapper: medal.tv public API at api.medal.tv
 */

const MEDAL_API_BASE = "https://developers.medal.tv";
const MEDAL_API_KEY = process.env.MEDAL_API_KEY || "";

export interface MedalClip {
  contentId: string;
  contentTitle: string;
  contentThumbnail: string;
  directClipUrl: string;
  videoLengthSeconds: number;
  createdTimestamp: number;
  categoryId: number;
}

/** Check if a user has Medal linked */
export async function hasMedalLinked(userId: string): Promise<boolean> {
  const [account] = await db.select().from(gameAccounts)
    .where(and(eq(gameAccounts.userId, userId), eq(gameAccounts.platform, "medal")));
  return !!account;
}

/** Get a user's Medal user ID from their linked account */
export async function getMedalUserId(userId: string): Promise<string | null> {
  const [account] = await db.select().from(gameAccounts)
    .where(and(eq(gameAccounts.userId, userId), eq(gameAccounts.platform, "medal")));
  return account?.platformUserId ?? null;
}

/**
 * Fetch recent clips from a Medal user.
 * Returns clips sorted by newest first.
 */
export async function getRecentClips(medalUserId: string, limit = 10): Promise<MedalClip[]> {
  try {
    const url = `${MEDAL_API_BASE}/v1/latest?userId=${medalUserId}&limit=${limit}`;
    const res = await fetch(url, {
      headers: MEDAL_API_KEY ? { "Authorization": MEDAL_API_KEY } : {},
    });

    if (!res.ok) {
      console.error(`[Medal] API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as any;
    const clips: MedalClip[] = (data.contentObjects || []).map((c: any) => ({
      contentId: c.contentId,
      contentTitle: c.contentTitle || "",
      contentThumbnail: c.contentThumbnail || "",
      directClipUrl: c.directClipUrl || `https://medal.tv/clip/${c.contentId}`,
      videoLengthSeconds: c.videoLengthSeconds || 0,
      createdTimestamp: c.createdTimestamp || 0,
      categoryId: c.categoryId || 0,
    }));

    return clips;
  } catch (err) {
    console.error("[Medal] Failed to fetch clips:", err);
    return [];
  }
}

/**
 * Find a clip from a player that was created after a specific timestamp.
 * Used to find the match clip after a wager.
 */
export async function findMatchClip(
  medalUserId: string,
  afterTimestamp: Date,
): Promise<MedalClip | null> {
  const clips = await getRecentClips(medalUserId, 10);
  const afterMs = afterTimestamp.getTime();

  // Find the first clip created after the match started
  const matchClip = clips.find(c => c.createdTimestamp > afterMs);
  return matchClip ?? null;
}

/**
 * Get the thumbnail URL for a clip (used for score extraction).
 * Medal provides thumbnails at various resolutions.
 */
export function getClipThumbnail(clip: MedalClip): string {
  return clip.contentThumbnail;
}

/**
 * Attempt to find match clips from both players after a wager.
 * Returns clip data for both players if found.
 */
export async function findWagerClips(
  creatorUserId: string,
  opponentUserId: string,
  matchStartTime: Date,
): Promise<{
  creatorClip: MedalClip | null;
  opponentClip: MedalClip | null;
}> {
  const creatorMedalId = await getMedalUserId(creatorUserId);
  const opponentMedalId = await getMedalUserId(opponentUserId);

  const [creatorClip, opponentClip] = await Promise.all([
    creatorMedalId ? findMatchClip(creatorMedalId, matchStartTime) : null,
    opponentMedalId ? findMatchClip(opponentMedalId, matchStartTime) : null,
  ]);

  return { creatorClip, opponentClip };
}
