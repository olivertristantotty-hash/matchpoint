import { GameAdapter, MatchResult } from "./base.js";

const RIOT_API_BASE = "https://americas.api.riotgames.com";

/**
 * Riot Games adapter — supports League of Legends and Valorant.
 * Uses Riot's official API to pull match history and verify results.
 *
 * Requires: RIOT_API_KEY env var
 * Players must link their Riot PUUID via /link-account
 */
export class RiotAdapter implements GameAdapter {
  readonly gameKey: string;
  readonly displayName: string;
  readonly supportsAutoVerify = true;

  private apiKey: string;
  private matchUrlBase: string;

  constructor(game: "lol" | "valorant") {
    this.apiKey = process.env.RIOT_API_KEY || "";
    if (game === "lol") {
      this.gameKey = "lol";
      this.displayName = "League of Legends";
      this.matchUrlBase = `${RIOT_API_BASE}/lol/match/v5/matches`;
    } else {
      this.gameKey = "valorant";
      this.displayName = "Valorant";
      this.matchUrlBase = `${RIOT_API_BASE}/val/match/v1/matches`;
    }
  }

  async verifyMatch(
    player1PlatformId: string,
    player2PlatformId: string,
    afterTimestamp: Date,
  ): Promise<MatchResult | null> {
    if (!this.apiKey) return null;

    try {
      // Get recent match IDs for player 1
      const matchIds = await this.getRecentMatchIds(player1PlatformId, afterTimestamp);

      for (const matchId of matchIds) {
        const result = await this.checkMatch(matchId, player1PlatformId, player2PlatformId);
        if (result) return result;
      }

      return null;
    } catch (err) {
      console.error(`[RiotAdapter] Error verifying match:`, err);
      return null;
    }
  }

  private async getRecentMatchIds(puuid: string, after: Date): Promise<string[]> {
    const startTime = Math.floor(after.getTime() / 1000);
    const url = `${this.matchUrlBase}/by-puuid/${puuid}/ids?startTime=${startTime}&count=10`;

    const res = await fetch(url, {
      headers: { "X-Riot-Token": this.apiKey },
    });

    if (!res.ok) return [];
    return res.json() as Promise<string[]>;
  }

  private async checkMatch(
    matchId: string,
    player1PlatformId: string,
    player2PlatformId: string,
  ): Promise<MatchResult | null> {
    const url = `${this.matchUrlBase}/${matchId}`;
    const res = await fetch(url, {
      headers: { "X-Riot-Token": this.apiKey },
    });

    if (!res.ok) return null;
    const data = await res.json() as any;

    // Check both players are in this match
    const participants = data.info?.participants || [];
    const p1 = participants.find((p: any) => p.puuid === player1PlatformId);
    const p2 = participants.find((p: any) => p.puuid === player2PlatformId);

    if (!p1 || !p2) return null;

    // They need to be on opposite teams
    if (p1.teamId === p2.teamId) return null;

    const p1Won = p1.win === true;

    return {
      winnerId: p1Won ? player1PlatformId : player2PlatformId,
      loserId: p1Won ? player2PlatformId : player1PlatformId,
      matchId,
      timestamp: new Date(data.info.gameEndTimestamp),
      verified: true,
    };
  }
}
