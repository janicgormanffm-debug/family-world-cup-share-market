import type { AdminAccount, GameState, Match, Player, Team } from "./game";

const groupRows: Array<[string, string, string, string]> = [
  ["A", "Mexico", "MEX", "mx"],
  ["A", "South Africa", "RSA", "za"],
  ["A", "South Korea", "KOR", "kr"],
  ["A", "Czechia", "CZE", "cz"],
  ["B", "Canada", "CAN", "ca"],
  ["B", "Bosnia and Herzegovina", "BIH", "ba"],
  ["B", "Qatar", "QAT", "qa"],
  ["B", "Switzerland", "SUI", "ch"],
  ["C", "Brazil", "BRA", "br"],
  ["C", "Morocco", "MAR", "ma"],
  ["C", "Haiti", "HAI", "ht"],
  ["C", "Scotland", "SCO", "gb-sct"],
  ["D", "USA", "USA", "us"],
  ["D", "Paraguay", "PAR", "py"],
  ["D", "Australia", "AUS", "au"],
  ["D", "Turkiye", "TUR", "tr"],
  ["E", "Germany", "GER", "de"],
  ["E", "Curacao", "CUW", "cw"],
  ["E", "Ivory Coast", "CIV", "ci"],
  ["E", "Ecuador", "ECU", "ec"],
  ["F", "Netherlands", "NED", "nl"],
  ["F", "Japan", "JPN", "jp"],
  ["F", "Sweden", "SWE", "se"],
  ["F", "Tunisia", "TUN", "tn"],
  ["G", "Belgium", "BEL", "be"],
  ["G", "Egypt", "EGY", "eg"],
  ["G", "Iran", "IRN", "ir"],
  ["G", "New Zealand", "NZL", "nz"],
  ["H", "Spain", "ESP", "es"],
  ["H", "Cape Verde", "CPV", "cv"],
  ["H", "Saudi Arabia", "KSA", "sa"],
  ["H", "Uruguay", "URU", "uy"],
  ["I", "France", "FRA", "fr"],
  ["I", "Senegal", "SEN", "sn"],
  ["I", "Iraq", "IRQ", "iq"],
  ["I", "Norway", "NOR", "no"],
  ["J", "Argentina", "ARG", "ar"],
  ["J", "Algeria", "ALG", "dz"],
  ["J", "Austria", "AUT", "at"],
  ["J", "Jordan", "JOR", "jo"],
  ["K", "Portugal", "POR", "pt"],
  ["K", "Congo DR", "COD", "cd"],
  ["K", "Uzbekistan", "UZB", "uz"],
  ["K", "Colombia", "COL", "co"],
  ["L", "England", "ENG", "gb-eng"],
  ["L", "Croatia", "CRO", "hr"],
  ["L", "Ghana", "GHA", "gh"],
  ["L", "Panama", "PAN", "pa"],
];

export const seedTeams: Team[] = groupRows.map(([group, name, code, flagCode]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  name,
  code,
  group,
  status: "live",
  flagCode,
}));

export const seedAdmins: AdminAccount[] = [
  {
    id: "admin-main",
    name: "Game Admin",
    pin: "2026",
  },
];

export const seedPlayers: Player[] = [];

export const seedMatches: Match[] = [
  {
    id: "match-1",
    stageId: "group",
    roundLabel: "Group A - Matchday 1",
    group: "A",
    homeTeamId: "mexico",
    awayTeamId: "south-africa",
    kickoffAt: "2026-06-11T17:00:00.000Z",
    venue: "Estadio Azteca",
    status: "scheduled",
  },
  {
    id: "match-2",
    stageId: "group",
    roundLabel: "Group B - Matchday 1",
    group: "B",
    homeTeamId: "canada",
    awayTeamId: "bosnia-and-herzegovina",
    kickoffAt: "2026-06-12T19:00:00.000Z",
    venue: "BMO Field",
    status: "scheduled",
  },
  {
    id: "match-3",
    stageId: "group",
    roundLabel: "Group C - Matchday 1",
    group: "C",
    homeTeamId: "brazil",
    awayTeamId: "morocco",
    kickoffAt: "2026-06-13T01:00:00.000Z",
    venue: "MetLife Stadium",
    status: "scheduled",
  },
];

export function createInitialGameState(): GameState {
  const now = new Date().toISOString();

  return {
    stageId: "pre",
    admins: seedAdmins,
    joinCode: "FAMILY-2026",
    teams: seedTeams,
    players: seedPlayers,
    matches: seedMatches,
    buys: [],
    offers: [],
    trades: [],
    potSales: [],
    knockoutSlotLocks: {},
    winnerTeamId: "",
    tournamentSync: {
      provider: "custom-json",
      endpoint: "https://worldcup26.ir",
      autoRefreshEnabled: true,
      autoRefreshSeconds: 120,
      autoStageEnabled: true,
      lastSyncStatus: "Seed data loaded",
    },
    lastUpdatedAt: now,
  };
}
