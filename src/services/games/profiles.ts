/** Game profile — defines rules, settings, and verification method for each game */
export interface GameProfile {
  key: string;
  name: string;
  subGames?: string[];             // specific titles within the franchise
  thumbnailUrl?: string;           // small cover art for Discord embeds
  rules: string[];
  matchDurationMinutes: number;
  verificationMethod: "api" | "screenshot" | "manual";
  screenshotPrompt: string;        // what to tell the player to screenshot
  ocrPrompt: string;               // prompt for the vision model to extract results
  apiPlatform?: string;            // for API-verified games
}

export const gameProfiles: Record<string, GameProfile> = {
  fifa: {
    key: "fifa",
    name: "FIFA / EA FC",
    subGames: ["EA FC 25", "EA FC 24", "FIFA 23", "FIFA 22"],
    thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/2195250/capsule_231x87.jpg",
    rules: [
      "Mode: Online Friendlies",
      "Half Length: 6 minutes",
      "Teams: Within 0.5★ of each other",
      "Extra Time + Penalties: ON",
      "Winner: Match winner (including pens)",
    ],
    matchDurationMinutes: 30,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final whistle score screen** showing both team names and the score.",
    ocrPrompt: `Analyze this FIFA/EA FC final score screenshot. Extract:
- home_team: the team name on the left
- away_team: the team name on the right
- home_score: goals scored by the home team (integer)
- away_score: goals scored by the away team (integer)
- went_to_penalties: true/false
Respond ONLY with valid JSON matching this format. If you cannot read the score, respond with {"error": "unreadable"}.`,
  },

  lol: {
    key: "lol",
    name: "League of Legends",
    thumbnailUrl: undefined,
    rules: [
      "Mode: Custom Game, Summoner's Rift",
      "Format: 1v1 — First Blood, 100 CS, or First Tower",
      "No champion bans unless agreed",
    ],
    matchDurationMinutes: 45,
    verificationMethod: "api",
    apiPlatform: "riot",
    screenshotPrompt: "Send a screenshot of the **end-of-game screen** showing the result.",
    ocrPrompt: `Analyze this League of Legends end-of-game screenshot. Extract:
- winning_team: "blue" or "red"
- player_names: list of all player names visible
- game_duration: approximate duration if visible
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  valorant: {
    key: "valorant",
    name: "Valorant",
    thumbnailUrl: undefined,
    rules: [
      "Mode: Custom Game",
      "Map: Agreed before match",
      "Format: First to 13 rounds",
    ],
    matchDurationMinutes: 60,
    verificationMethod: "api",
    apiPlatform: "riot",
    screenshotPrompt: "Send a screenshot of the **match summary screen** showing round score.",
    ocrPrompt: `Analyze this Valorant match summary screenshot. Extract:
- team1_score: rounds won by team on left (integer)
- team2_score: rounds won by team on right (integer)
- player_names: list of player names visible
- map: map name if visible
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  rocketleague: {
    key: "rocketleague",
    name: "Rocket League",
    thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/252950/capsule_231x87.jpg",
    rules: [
      "Mode: Private Match",
      "Match Length: 5 minutes",
      "Overtime: Sudden death (default)",
    ],
    matchDurationMinutes: 15,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final scoreboard** showing Blue vs Orange score.",
    ocrPrompt: `Analyze this Rocket League final scoreboard screenshot. Extract:
- blue_score: goals by blue team (integer)
- orange_score: goals by orange team (integer)
- player_names: list of player names visible with their team color
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  cod: {
    key: "cod",
    name: "Call of Duty",
    subGames: ["Black Ops 6", "MW3 (2023)", "MW2 (2022)", "Warzone", "Cold War", "Black Ops 3", "Black Ops 2"],
    thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/2519060/capsule_231x87.jpg",
    rules: [
      "Mode: 1v1 Private Match",
      "Map: Agreed before match",
      "Rules: First to 30 kills or highest at 10 min",
      "Hardcore: OFF unless agreed",
    ],
    matchDurationMinutes: 20,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final scoreboard** showing player names and kill counts.",
    ocrPrompt: `Analyze this Call of Duty scoreboard screenshot. Extract:
- players: array of {name, kills, deaths} for each player visible
- winner: the player name with the most kills
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  fortnite: {
    key: "fortnite",
    name: "Fortnite",
    thumbnailUrl: undefined,
    rules: [
      "Mode: 1v1 Creative (Box Fight or Zone Wars)",
      "Format: First to 5 kills or Best of 5 rounds",
    ],
    matchDurationMinutes: 20,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final score/elimination screen** showing the result.",
    ocrPrompt: `Analyze this Fortnite creative mode result screenshot. Extract:
- player1_name: first player name
- player1_score: their kills or round wins (integer)
- player2_name: second player name
- player2_score: their kills or round wins (integer)
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  nba2k: {
    key: "nba2k",
    name: "NBA 2K",
    subGames: ["NBA 2K25", "NBA 2K24", "NBA 2K23"],
    thumbnailUrl: undefined,
    rules: [
      "Mode: Play Now Online or MyTeam",
      "Quarter Length: 5 minutes",
      "Difficulty: All-Star",
      "Winner: Final score",
    ],
    matchDurationMinutes: 30,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final score screen** showing both teams and the score.",
    ocrPrompt: `Analyze this NBA 2K final score screenshot. Extract:
- home_team: the team name on the left
- away_team: the team name on the right
- home_score: points scored by the home team (integer)
- away_score: points scored by the away team (integer)
Respond ONLY with valid JSON matching this format. If you cannot read the score, respond with {"error": "unreadable"}.`,
  },

  madden: {
    key: "madden",
    name: "Madden NFL",
    subGames: ["Madden 25", "Madden 24", "Madden 23"],
    thumbnailUrl: undefined,
    rules: [
      "Mode: Head to Head",
      "Quarter Length: 5 minutes",
      "Difficulty: All-Madden",
      "Winner: Final score",
    ],
    matchDurationMinutes: 30,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final score screen** showing both teams and the score.",
    ocrPrompt: `Analyze this Madden NFL final score screenshot. Extract:
- home_team: the team name on the left
- away_team: the team name on the right
- home_score: points scored by the home team (integer)
- away_score: points scored by the away team (integer)
Respond ONLY with valid JSON matching this format. If you cannot read the score, respond with {"error": "unreadable"}.`,
  },

  mariokart: {
    key: "mariokart",
    name: "Mario Kart",
    subGames: ["Mario Kart 8 Deluxe"],
    thumbnailUrl: undefined,
    rules: [
      "Mode: VS Race or Battle",
      "Items: All Items",
      "CC: 150cc or Mirror",
      "Format: Best of 3 races or agreed",
    ],
    matchDurationMinutes: 20,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final race results** showing positions.",
    ocrPrompt: `Analyze this Mario Kart race results screenshot. Extract:
- players: array of {name, position} for each player visible
- winner: the player name in 1st place
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },

  other: {
    key: "other",
    name: "Other",
    rules: ["Custom rules — agree with your opponent before accepting."],
    matchDurationMinutes: 60,
    verificationMethod: "screenshot",
    screenshotPrompt: "Send a screenshot of the **final result screen** clearly showing who won.",
    ocrPrompt: `Analyze this game result screenshot. Try to determine:
- winner_name: the name of the winning player if identifiable
- score: the final score in any format
- game: what game this appears to be
Respond ONLY with valid JSON. If unreadable, respond with {"error": "unreadable"}.`,
  },
};

export function getGameProfile(key: string): GameProfile | undefined {
  return gameProfiles[key];
}
