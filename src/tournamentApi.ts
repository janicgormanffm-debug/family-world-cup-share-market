import { GameState, Match, Team, TeamStatus, nowId, slugify } from "./game";

type WorldCupApiTeam = {
  id?: string;
  name_en?: string;
  flag?: string;
  fifa_code?: string;
  iso2?: string;
  groups?: string;
};

type WorldCupApiGame = {
  id?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_score?: string | number | null;
  away_score?: string | number | null;
  group?: string;
  matchday?: string | number;
  local_date?: string;
  stadium_id?: string;
  stadium_name_en?: string;
  finished?: string | boolean;
  time_elapsed?: string;
  type?: string;
};

type WorldCupApiTeamsResponse = {
  teams?: WorldCupApiTeam[];
};

type WorldCupApiGamesResponse = {
  games?: WorldCupApiGame[];
};

export type TournamentSyncResult = {
  teams: Team[];
  matches: Match[];
  status: string;
};

export async function fetchWorldCup26Feed(endpoint: string): Promise<TournamentSyncResult> {
  const baseUrl = endpoint.replace(/\/$/, "");
  const [teamsResponse, gamesResponse] = await Promise.all([
    fetch(`${baseUrl}/get/teams`),
    fetch(`${baseUrl}/get/games`),
  ]);

  if (!teamsResponse.ok) {
    throw new Error(`Teams feed returned ${teamsResponse.status}`);
  }

  if (!gamesResponse.ok) {
    throw new Error(`Games feed returned ${gamesResponse.status}`);
  }

  const teamsJson = (await teamsResponse.json()) as WorldCupApiTeamsResponse;
  const gamesJson = (await gamesResponse.json()) as WorldCupApiGamesResponse;
  const teams = normalizeTeams(teamsJson.teams ?? []);
  const matches = normalizeMatches(gamesJson.games ?? [], teams);

  return {
    teams,
    matches,
    status: `Synced ${teams.length} teams and ${matches.length} matches`,
  };
}

export function applyTournamentSync(state: GameState, result: TournamentSyncResult): GameState {
  const syncedById = new Map(result.teams.map((team) => [team.id, team]));
  const existingById = new Map(state.teams.map((team) => [team.id, team]));
  const mergedTeams = result.teams.map((team) => {
    const existing = existingById.get(team.id);
    const status = inferTeamStatusFromMatches(team.id, result.matches, existing?.status ?? "live");

    return {
      ...existing,
      ...team,
      status,
    };
  });

  state.teams.forEach((team) => {
    if (!syncedById.has(team.id)) mergedTeams.push(team);
  });

  return {
    ...state,
    teams: mergedTeams,
    matches: result.matches.length > 0 ? result.matches : state.matches,
    winnerTeamId:
      mergedTeams.find((team) => team.status === "winner")?.id ?? state.winnerTeamId,
    tournamentSync: {
      ...state.tournamentSync,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: result.status,
      lastSyncError: undefined,
    },
  };
}

function normalizeTeams(rows: WorldCupApiTeam[]): Team[] {
  const teams: Team[] = [];

  rows.forEach((row) => {
    const name = row.name_en?.trim();
    if (!name) return;

    teams.push({
        id: slugify(name),
        name,
        code: row.fifa_code?.trim() || name.slice(0, 3).toUpperCase(),
        group: row.groups?.trim() || "-",
        status: "live" as TeamStatus,
        flagCode: row.iso2?.trim().toLowerCase(),
        flagUrl: row.flag,
    });
  });

  return teams.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

function normalizeMatches(rows: WorldCupApiGame[], teams: Team[]): Match[] {
  const matches: Match[] = [];

  rows.forEach((row) => {
    const homeTeam = findTeam(teams, row.home_team_name_en);
    const awayTeam = findTeam(teams, row.away_team_name_en);
    if (!homeTeam || !awayTeam) return;

    const homeScore = parseScore(row.home_score);
    const awayScore = parseScore(row.away_score);
    const isFinished = row.finished === true || String(row.finished).toLowerCase() === "true";
    const isLive =
      !isFinished &&
      row.time_elapsed !== undefined &&
      !["", "notstarted", "not_started", "scheduled", "0"].includes(
        String(row.time_elapsed).toLowerCase(),
      );
    const stageId = stageIdFromType(row.type);
    const winnerTeamId =
      isFinished && homeScore !== undefined && awayScore !== undefined && homeScore !== awayScore
        ? homeScore > awayScore
          ? homeTeam.id
          : awayTeam.id
        : undefined;

    matches.push({
      id: row.id ? `api-${row.id}` : nowId("match"),
      stageId,
      roundLabel: roundLabel(row),
      group: row.group?.trim() || undefined,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      kickoffAt: parseApiDate(row.local_date),
      venue: row.stadium_name_en || (row.stadium_id ? `Stadium ${row.stadium_id}` : "TBC"),
      status: isFinished ? "full-time" : isLive ? "live" : "scheduled",
      homeScore,
      awayScore,
      winnerTeamId,
    });
  });

  return matches.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}

function findTeam(teams: Team[], name?: string): Team | undefined {
  if (!name) return undefined;
  const normalized = slugify(name);

  return teams.find((team) => team.id === normalized || slugify(team.name) === normalized);
}

function parseScore(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseApiDate(value?: string): string {
  if (!value) return new Date().toISOString();
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [month, day, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (!year || !month || !day) return new Date(value).toISOString();

  return new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0)).toISOString();
}

export function stageIdFromType(type?: string): Match["stageId"] {
  const normalized = String(type ?? "group").toLowerCase();
  if (normalized.includes("third") || normalized.includes("bronze")) return "bronze";
  if (normalized.includes("semi")) return "sf";
  if (normalized.includes("quarter")) return "qf";
  if (normalized.includes("32")) return "r32";
  if (normalized.includes("16")) return "r16";
  if (normalized.includes("final")) return "final";

  return "group";
}

function roundLabel(row: WorldCupApiGame): string {
  const type = String(row.type ?? "group").replace(/[_-]+/g, " ");

  if (row.group && row.matchday) {
    return `Group ${row.group} - Matchday ${row.matchday}`;
  }

  return type
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function inferTeamStatusFromMatches(
  teamId: string,
  matches: Match[],
  fallback: TeamStatus,
): TeamStatus {
  const final = matches.find((match) => match.stageId === "final" && match.status === "full-time");
  if (final?.winnerTeamId === teamId) return "winner";

  const knockoutLoss = matches.some((match) => {
    if (match.stageId === "group" || match.status !== "full-time" || !match.winnerTeamId) {
      return false;
    }

    const teamPlayed = match.homeTeamId === teamId || match.awayTeamId === teamId;
    return teamPlayed && match.winnerTeamId !== teamId;
  });

  if (knockoutLoss) return "eliminated";
  if (fallback === "winner") return "live";

  return fallback;
}
