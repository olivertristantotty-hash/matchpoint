import { GameAdapter } from "./base.js";
import { RiotAdapter } from "./riot.js";
import { ManualAdapter } from "./manual.js";

/** Registry of all game adapters */
const adapters = new Map<string, GameAdapter>();

function register(adapter: GameAdapter) {
  adapters.set(adapter.gameKey, adapter);
}

// ── Register adapters ──
register(new RiotAdapter("lol"));
register(new RiotAdapter("valorant"));
register(new ManualAdapter("fifa", "FIFA / EA FC"));
register(new ManualAdapter("rocketleague", "Rocket League"));
register(new ManualAdapter("cod", "Call of Duty"));
register(new ManualAdapter("fortnite", "Fortnite"));
register(new ManualAdapter("other", "Other"));

export function getAdapter(gameKey: string): GameAdapter | undefined {
  return adapters.get(gameKey);
}

export function getAllAdapters(): GameAdapter[] {
  return Array.from(adapters.values());
}

export type { GameAdapter, MatchResult } from "./base.js";
