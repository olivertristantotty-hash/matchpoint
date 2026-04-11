import { GameAdapter, MatchResult } from "./base.js";

/**
 * Fallback adapter for games without API support.
 * Always returns null — forces manual result reporting.
 */
export class ManualAdapter implements GameAdapter {
  readonly gameKey: string;
  readonly displayName: string;
  readonly supportsAutoVerify = false;

  constructor(gameKey: string, displayName: string) {
    this.gameKey = gameKey;
    this.displayName = displayName;
  }

  async verifyMatch(): Promise<MatchResult | null> {
    return null;
  }
}
