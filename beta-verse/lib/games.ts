// @/lib/games.ts
// Free data layer using ESPN public scoreboard for NFL, NBA, MLB, NHL, WNBA.
// No API keys required.

export type LeagueKey = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";

export type TeamName = { short: string; name: string };

export type GameRow = {
  id: string;
  start: string;   // ISO string
  league: LeagueKey;
  home: TeamName;
  away: TeamName;
};

export const ENABLED_LEAGUES: LeagueKey[] = ["NFL", "NBA", "MLB", "NHL", "WNBA"];

const ESPN_PATH: Record<LeagueKey, string> = {
  NFL:  "football/nfl",
  NBA:  "basketball/nba",
  MLB:  "baseball/mlb",
  NHL:  "hockey/nhl",
  WNBA: "basketball/wnba",
};

// ESPN needs YYYYMMDD
const toYYYYMMDD = (d: string | Date) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

function normalizeEspnEvent(league: LeagueKey, e: any): GameRow {
  const comp = Array.isArray(e?.competitions) ? e.competitions[0] : undefined;
  const comps = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const home = comps.find((c: any) => c?.homeAway === "home")?.team;
  const away = comps.find((c: any) => c?.homeAway === "away")?.team;

  return {
    id: String(e?.id ?? `${league}-${home?.displayName}-${away?.displayName}-${e?.date}`),
    start: e?.date ?? new Date().toISOString(),
    league,
    home: {
      short: home?.abbreviation || home?.shortDisplayName || "HOME",
      name:  home?.displayName || "Home",
    },
    away: {
      short: away?.abbreviation || away?.shortDisplayName || "AWAY",
      name:  away?.displayName || "Away",
    },
  };
}

export async function fetchGamesForLeague(league: LeagueKey, dayISO: string): Promise<GameRow[]> {
  const path = ESPN_PATH[league];
  const url = `https://site.api.espn.com/apis/v2/sports/${path}/scoreboard?dates=${encodeURIComponent(
    toYYYYMMDD(dayISO)
  )}`;

  const r = await fetch(url);
  if (!r.ok) return [];
  const json = await r.json();
  const events = Array.isArray(json?.events) ? json.events : [];
  return events.map((e: any) => normalizeEspnEvent(league, e));
}

export async function fetchAllLeagues(dayISO: string): Promise<GameRow[]> {
  const results = await Promise.allSettled(
    ENABLED_LEAGUES.map((lg) => fetchGamesForLeague(lg, dayISO))
  );
  const rows: GameRow[] = [];
  for (const r of results) if (r.status === "fulfilled") rows.push(...r.value);
  rows.sort(
    (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime() ||
      String(a.league).localeCompare(String(b.league))
  );
  return rows;
}

export async function earliestKickMillis(dayISO: string): Promise<number | null> {
  try {
    const rows = await fetchAllLeagues(dayISO);
    if (!rows.length) return null;
    const first = rows.reduce((min, r) => {
      const t = new Date(r.start).getTime();
      return isNaN(t) ? min : Math.min(min, t);
    }, Number.POSITIVE_INFINITY);
    return isFinite(first) ? first : null;
  } catch {
    return null;
  }
}
