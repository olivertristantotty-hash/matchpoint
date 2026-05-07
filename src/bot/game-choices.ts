/** Flattened game choices for slash commands (max 25) */
export const GAME_CHOICES = [
  // FIFA / EA FC
  { name: "EA FC 25", value: "fifa:EA FC 25" },
  { name: "EA FC 24", value: "fifa:EA FC 24" },
  { name: "FIFA 23", value: "fifa:FIFA 23" },
  { name: "FIFA 22", value: "fifa:FIFA 22" },
  // League of Legends
  { name: "League of Legends", value: "lol" },
  // Valorant
  { name: "Valorant", value: "valorant" },
  // Rocket League
  { name: "Rocket League", value: "rocketleague" },
  // Call of Duty
  { name: "CoD: Black Ops 6", value: "cod:Black Ops 6" },
  { name: "CoD: MW3 (2023)", value: "cod:MW3 (2023)" },
  { name: "CoD: MW2 (2022)", value: "cod:MW2 (2022)" },
  { name: "CoD: Warzone", value: "cod:Warzone" },
  { name: "CoD: Cold War", value: "cod:Cold War" },
  { name: "CoD: Black Ops 3", value: "cod:Black Ops 3" },
  { name: "CoD: Black Ops 2", value: "cod:Black Ops 2" },
  // Fortnite
  { name: "Fortnite", value: "fortnite" },
  // NBA 2K
  { name: "NBA 2K25", value: "nba2k:NBA 2K25" },
  { name: "NBA 2K24", value: "nba2k:NBA 2K24" },
  { name: "NBA 2K23", value: "nba2k:NBA 2K23" },
  // Madden NFL
  { name: "Madden 25", value: "madden:Madden 25" },
  { name: "Madden 24", value: "madden:Madden 24" },
  { name: "Madden 23", value: "madden:Madden 23" },
  // Mario Kart
  { name: "Mario Kart 8 Deluxe", value: "mariokart:Mario Kart 8 Deluxe" },
  // Other
  { name: "Other", value: "other" },
] as const;

/** Leaderboard filter choices — franchise-level only */
export const LEADERBOARD_GAME_CHOICES = [
  { name: "FIFA / EA FC", value: "fifa" },
  { name: "League of Legends", value: "lol" },
  { name: "Valorant", value: "valorant" },
  { name: "Rocket League", value: "rocketleague" },
  { name: "Call of Duty", value: "cod" },
  { name: "Fortnite", value: "fortnite" },
  { name: "NBA 2K", value: "nba2k" },
  { name: "Madden NFL", value: "madden" },
  { name: "Mario Kart", value: "mariokart" },
  { name: "Other", value: "other" },
] as const;

/** Parse a game choice value into franchise key and optional title */
export function parseGameChoice(value: string): { franchise: string; title: string | null } {
  const colonIdx = value.indexOf(":");
  if (colonIdx === -1) return { franchise: value, title: null };
  return { franchise: value.slice(0, colonIdx), title: value.slice(colonIdx + 1) };
}
