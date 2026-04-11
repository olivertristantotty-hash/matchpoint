/** Base interface all game adapters must implement */
export interface MatchResult {
  winnerId: string;        // your platform user ID
  loserId: string;
  score?: string;          // e.g. "3-1"
  matchId?: string;        // platform-specific match ID
  timestamp: Date;
  verified: boolean;
}

export interface GameAdapter {
  /** Unique game key (matches wager.game field) */
  readonly gameKey: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Whether this adapter can auto-verify results */
  readonly supportsAutoVerify: boolean;

  /**
   * Attempt to find and verify a match result between two players.
   * Returns null if no matching game found or API unavailable.
   */
  verifyMatch(
    player1PlatformId: string,
    player2PlatformId: string,
    afterTimestamp: Date,
  ): Promise<MatchResult | null>;
}
