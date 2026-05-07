import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { wagers } from "../db/schema.js";
import { analyzeScreenshot } from "./screenshot.js";
import { wagerService } from "./wager.js";

export interface AutoDisputeResult {
  resolved: boolean;
  method: "screenshot_comparison" | "evidence_advantage" | "no_evidence" | "inconclusive";
  winnerId?: string;
  reason: string;
}

export async function tryAutoResolveDispute(wagerId: string): Promise<AutoDisputeResult> {
  const [wager] = await db.select().from(wagers).where(eq(wagers.id, wagerId));
  if (!wager) return { resolved: false, method: "inconclusive", reason: "Wager not found" };

  // Get both players' screenshots from the wager record
  const creatorScreenshot = wager.creatorClipUrl;
  const opponentScreenshot = wager.opponentClipUrl;

  // Case 1: Neither player has evidence → refund both
  if (!creatorScreenshot && !opponentScreenshot) {
    await wagerService.refundWager(wagerId, "Auto-resolved: neither player provided evidence");
    return {
      resolved: true,
      method: "no_evidence",
      reason: "Neither player provided screenshot evidence. Match refunded.",
    };
  }

  // Case 2: Only one player has evidence → they win
  if (creatorScreenshot && !opponentScreenshot) {
    await wagerService.settleWager(wagerId, wager.creatorId);
    return {
      resolved: true,
      method: "evidence_advantage",
      winnerId: wager.creatorId,
      reason: "Only the host provided screenshot evidence. Auto-settled in their favor.",
    };
  }

  if (!creatorScreenshot && opponentScreenshot) {
    await wagerService.settleWager(wagerId, wager.opponentId!);
    return {
      resolved: true,
      method: "evidence_advantage",
      winnerId: wager.opponentId!,
      reason: "Only the opponent provided screenshot evidence. Auto-settled in their favor.",
    };
  }

  // Case 3: Both have screenshots → analyze with vision AI
  try {
    const [creatorResult, opponentResult] = await Promise.all([
      analyzeScreenshot(creatorScreenshot!, wager.game),
      analyzeScreenshot(opponentScreenshot!, wager.game),
    ]);

    // If both screenshots were successfully analyzed
    if (creatorResult.success && opponentResult.success) {
      const creatorData = creatorResult.data!;
      const opponentData = opponentResult.data!;

      // Try to determine winner from screenshot data
      const creatorScore = extractScore(creatorData);
      const opponentScore = extractScore(opponentData);

      if (creatorScore !== null && opponentScore !== null) {
        // Both screenshots have readable scores
        // Check if they show the same result
        if (creatorScore.winner === "home" && opponentScore.winner === "home") {
          // Both screenshots show the same winner — settle for creator (home)
          await wagerService.settleWager(wagerId, wager.creatorId);
          return {
            resolved: true,
            method: "screenshot_comparison",
            winnerId: wager.creatorId,
            reason: `Auto-resolved: both screenshots show the same result. Score: ${creatorScore.display}`,
          };
        }

        if (creatorScore.winner === "away" && opponentScore.winner === "away") {
          await wagerService.settleWager(wagerId, wager.opponentId!);
          return {
            resolved: true,
            method: "screenshot_comparison",
            winnerId: wager.opponentId!,
            reason: `Auto-resolved: both screenshots show the same result. Score: ${opponentScore.display}`,
          };
        }
      }
    }

    // If we got here, screenshots were inconclusive
    return {
      resolved: false,
      method: "inconclusive",
      reason: "Screenshots could not be conclusively compared. Escalating to moderator.",
    };
  } catch (err) {
    console.error("[AutoDispute] Vision analysis failed:", err);
    return {
      resolved: false,
      method: "inconclusive",
      reason: "Screenshot analysis failed. Escalating to moderator.",
    };
  }
}

// Helper to extract score info from OCR data
function extractScore(data: Record<string, any>): { winner: "home" | "away"; display: string } | null {
  // FIFA / sports games
  if (data.home_score !== undefined && data.away_score !== undefined) {
    const home = Number(data.home_score);
    const away = Number(data.away_score);
    if (isNaN(home) || isNaN(away)) return null;
    return {
      winner: home > away ? "home" : "away",
      display: `${data.home_team ?? "Home"} ${home} - ${away} ${data.away_team ?? "Away"}`,
    };
  }

  // Valorant / round-based
  if (data.team1_score !== undefined && data.team2_score !== undefined) {
    const t1 = Number(data.team1_score);
    const t2 = Number(data.team2_score);
    if (isNaN(t1) || isNaN(t2)) return null;
    return {
      winner: t1 > t2 ? "home" : "away",
      display: `${t1} - ${t2}`,
    };
  }

  // CoD / kill-based — check players array
  if (data.players && Array.isArray(data.players) && data.players.length >= 2) {
    const sorted = [...data.players].sort((a: any, b: any) => (b.kills ?? 0) - (a.kills ?? 0));
    return {
      winner: "home", // first player in sorted = winner
      display: `${sorted[0]?.name}: ${sorted[0]?.kills} kills`,
    };
  }

  // Fortnite
  if (data.player1_score !== undefined && data.player2_score !== undefined) {
    const p1 = Number(data.player1_score);
    const p2 = Number(data.player2_score);
    if (isNaN(p1) || isNaN(p2)) return null;
    return {
      winner: p1 > p2 ? "home" : "away",
      display: `${data.player1_name ?? "P1"} ${p1} - ${p2} ${data.player2_name ?? "P2"}`,
    };
  }

  // LoL
  if (data.winning_team) {
    return {
      winner: data.winning_team === "blue" ? "home" : "away",
      display: `Winner: ${data.winning_team} side`,
    };
  }

  // Mario Kart
  if (data.winner) {
    return {
      winner: "home", // can't determine home/away from just a winner name
      display: `Winner: ${data.winner}`,
    };
  }

  return null;
}
