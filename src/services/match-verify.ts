import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers, matchReports, gameAccounts } from "../db/schema.js";
import { wagerService } from "./wager.js";
import { analyzeScreenshot } from "./screenshot.js";
import { getGameProfile } from "./games/profiles.js";
import { tryAutoVerify } from "./verification.js";

export interface VerificationResult {
  method: "api" | "screenshot" | "manual";
  settled: boolean;
  winnerId?: string;
  score?: string;
  error?: string;
  needsDispute?: boolean;
}

/**
 * Master verification flow for a wager.
 * Tries each method in order: API → Screenshot OCR → Manual fallback.
 */
export async function verifyMatch(wagerId: string): Promise<VerificationResult> {
  const wager = await wagerService.getWager(wagerId);
  if (!wager) return { method: "manual", settled: false, error: "Wager not found" };

  const profile = getGameProfile(wager.game);
  if (!profile) return { method: "manual", settled: false, error: "Unknown game" };

  // ── Tier 1: Try API auto-verification ──
  if (profile.verificationMethod === "api") {
    const apiResult = await tryAutoVerify(wagerId);
    if (apiResult) {
      return { method: "api", settled: true };
    }
    // API failed — fall through to screenshot
  }

  // ── Tier 2: Try screenshot OCR ──
  const reports = await db
    .select()
    .from(matchReports)
    .where(eq(matchReports.wagerId, wagerId));

  const creatorReport = reports.find(r => r.userId === wager.creatorId);
  const opponentReport = reports.find(r => r.userId === wager.opponentId);

  // Need both screenshots
  if (!creatorReport?.screenshotUrl || !opponentReport?.screenshotUrl) {
    return { method: "screenshot", settled: false, error: "Waiting for both screenshots" };
  }

  const [creatorOCR, opponentOCR] = await Promise.all([
    analyzeScreenshot(creatorReport.screenshotUrl, wager.game),
    analyzeScreenshot(opponentReport.screenshotUrl, wager.game),
  ]);

  // Both OCR succeeded — compare results
  if (creatorOCR.success && opponentOCR.success) {
    const comparison = compareResults(wager.game, creatorOCR.data!, opponentOCR.data!);

    if (comparison.agreed && comparison.winnerId) {
      // Map the winner back to our user IDs
      // The OCR data contains game-specific info, we need to figure out
      // which of our two players won based on the score
      const winnerUserId = determineWinner(
        wager.game,
        creatorOCR.data!,
        wager.creatorId,
        wager.opponentId!,
      );

      if (winnerUserId) {
        await wagerService.settleWager(wagerId, winnerUserId);
        return {
          method: "screenshot",
          settled: true,
          winnerId: winnerUserId,
          score: comparison.score,
        };
      }
    }

    if (!comparison.agreed) {
      return {
        method: "screenshot",
        settled: false,
        needsDispute: true,
        error: `Screenshots show different results: ${comparison.reason}`,
      };
    }
  }

  // OCR failed on one or both — fall back to manual report comparison
  return { method: "manual", settled: false, error: "Could not read screenshots automatically" };
}

/** Compare OCR results from two screenshots */
function compareResults(
  game: string,
  data1: Record<string, any>,
  data2: Record<string, any>,
): { agreed: boolean; winnerId?: string; score?: string; reason?: string } {

  switch (game) {
    case "fifa": {
      const score1 = `${data1.home_score}-${data1.away_score}`;
      const score2 = `${data2.home_score}-${data2.away_score}`;
      // Scores should match (or be reversed if players see different sides)
      const match = score1 === score2 ||
        `${data1.home_score}-${data1.away_score}` === `${data2.away_score}-${data2.home_score}`;

      if (match) {
        return { agreed: true, score: score1 };
      }
      return { agreed: false, reason: `Player 1 sees ${score1}, Player 2 sees ${score2}` };
    }

    case "rocketleague": {
      const match = data1.blue_score === data2.blue_score &&
        data1.orange_score === data2.orange_score;
      if (match) {
        return { agreed: true, score: `Blue ${data1.blue_score} - Orange ${data1.orange_score}` };
      }
      return { agreed: false, reason: "Scores don't match between screenshots" };
    }

    case "cod": {
      // Compare the winner name from both screenshots
      if (data1.winner && data2.winner && data1.winner === data2.winner) {
        return { agreed: true, winnerId: data1.winner };
      }
      return { agreed: false, reason: "Different winners detected in screenshots" };
    }

    default: {
      // Generic comparison — check if both screenshots show the same winner
      if (data1.winner_name && data2.winner_name && data1.winner_name === data2.winner_name) {
        return { agreed: true, winnerId: data1.winner_name };
      }
      return { agreed: false, reason: "Could not confirm matching results" };
    }
  }
}

/**
 * Determine which of our platform users won based on OCR data.
 * This maps game-specific score data back to our user IDs.
 *
 * For FIFA: the creator is always "home" (left side).
 * For RL: creator picks their team color when creating the wager.
 * For others: we match by linked gamertag.
 */
function determineWinner(
  game: string,
  ocrData: Record<string, any>,
  creatorId: string,
  opponentId: string,
): string | null {
  switch (game) {
    case "fifa": {
      const homeScore = parseInt(ocrData.home_score);
      const awayScore = parseInt(ocrData.away_score);
      if (isNaN(homeScore) || isNaN(awayScore)) return null;
      // Convention: wager creator is home team
      return homeScore > awayScore ? creatorId : opponentId;
    }

    case "rocketleague": {
      const blue = parseInt(ocrData.blue_score);
      const orange = parseInt(ocrData.orange_score);
      if (isNaN(blue) || isNaN(orange)) return null;
      // Convention: wager creator is blue team
      return blue > orange ? creatorId : opponentId;
    }

    default:
      // For other games, we can't reliably map OCR winner to user ID
      // without gamertag matching — fall back to null
      return null;
  }
}
