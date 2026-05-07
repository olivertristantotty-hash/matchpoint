import { findWagerClips, MedalClip, hasMedalLinked } from "./medal.js";
import { wagerService } from "./wager.js";
import { analyzeScreenshot } from "./screenshot.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers } from "../db/schema.js";

export interface MedalVerifyResult {
  status: "verified" | "clips_found" | "missing_clips" | "no_medal" | "error";
  creatorClip?: MedalClip;
  opponentClip?: MedalClip;
  winnerId?: string;
  score?: string;
  error?: string;
}

/**
 * Full Medal verification flow for a wager:
 * 1. Check both players have Medal linked
 * 2. Find clips from both players after match start
 * 3. If OCR is available, extract scores from thumbnails
 * 4. Return clips + verification result
 */
export async function verifyWithMedal(wagerId: string): Promise<MedalVerifyResult> {
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return { status: "error", error: "Wager not found" };

  // Check Medal linked
  const creatorHasMedal = await hasMedalLinked(wager.creatorId);
  const opponentHasMedal = wager.opponentId ? await hasMedalLinked(wager.opponentId) : false;

  if (!creatorHasMedal && !opponentHasMedal) {
    return { status: "no_medal" };
  }

  // Find clips
  const matchStart = wager.createdAt;
  const { creatorClip, opponentClip } = await findWagerClips(
    wager.creatorId,
    wager.opponentId!,
    matchStart,
  );

  if (!creatorClip && !opponentClip) {
    return { status: "missing_clips", error: "No clips found from either player. Make sure you saved your clip (F8 in Medal)." };
  }

  // Store clip URLs on the wager for reference
  const clipData = {
    creatorClipUrl: creatorClip?.directClipUrl ?? null,
    opponentClipUrl: opponentClip?.directClipUrl ?? null,
  };

  // Try OCR on thumbnails if vision provider is configured
  if (process.env.VISION_PROVIDER && creatorClip && opponentClip) {
    try {
      const [creatorOCR, opponentOCR] = await Promise.all([
        analyzeScreenshot(creatorClip.contentThumbnail, wager.game),
        analyzeScreenshot(opponentClip.contentThumbnail, wager.game),
      ]);

      if (creatorOCR.success && opponentOCR.success) {
        // Both thumbnails readable — could auto-verify
        // For now, return clips_found and let the manual flow handle it
        // Full auto-verify from thumbnails is unreliable (thumbnail ≠ score screen)
      }
    } catch {}
  }

  return {
    status: "clips_found",
    creatorClip: creatorClip ?? undefined,
    opponentClip: opponentClip ?? undefined,
  };
}
