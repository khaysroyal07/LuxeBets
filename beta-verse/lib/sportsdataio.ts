// lib/sportsdataio.ts
import Constants from "expo-constants";

export type SportKey = "nfl" | "nba" | "mlb" | "nhl" | "wnba";

const KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  (Constants?.expoConfig?.extra as any)?.SPORTSDATAIO_KEY ||
  "";

const API: Record<
  SportKey,
  {
    base: string;
    teams: string;
    // schedule
    gamesByDate?: string;      // by-date path (where supported)
    scoresByDate?: string;     // NFL uses ScoresByDate
    // odds
    oddsByDate?: string;       // by-date odds path (NBA/MLB/NHL/WNBA)
    oddsByWeek?: string;       // NFL odds by week
  }
> = {
  nfl: {
    base: "https://api.sportsdata.io/v3/nfl",
    teams: "scores/json/Teams",
    scoresByDate: "scores/json/ScoresByDate",
    oddsByWeek: "odds/json/GameOddsByWeek",
  },
  nba: {
    base: "https://api.sportsdata.io/v3/nba",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  mlb: {
    base: "https://api.sportsdata.io/v3/mlb",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  nhl: {
    base: "https://api.sportsdata.io/v3/nhl",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  wnba: {
    base: "https://api.sportsdata.io/v3/wnba",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const q = (path: string) => `${path}?key=${encodeURIComponent(KEY)}`;
const sanitizeUrl = (u?: string | null) => (u && u.startsWith("http://") ? `https://${u.slice(7)}` : (u || null));

export function isNotEnabledError(err: any) {
  const s = String(err?.message || err || "");
  return (
    s.includes("Plan does not support") ||
    s.includes("not subscribed") ||
    s.includes("unauthorized") ||
    s.includes("HTTP 401") ||
    s.includes("HTTP 403")
  );
}

/* ---------------- Teams (with cache) ---------------- */
type TeamInfo = { name: string; logo?: string | null; abbr: string };
const teamCache: Partial<Record<SportKey, Record<string, TeamInfo>>> = {};
const teamKey = (v: string | null | undefined) => String(v || "").trim().toUpperCase();

/** Map of ABBR → {name, logo, abbr} */
export async function getTeams(sport: SportKey): Promise<Record<string, TeamInfo>> {
  if (teamCache[sport]) return teamCache[sport]!;
  if (!KEY) throw new Error("SportsDataIO key missing");

  const { base, teams } = API[sport];
  const url = `${base}/${q(teams)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.text()) || `Teams error ${r.status}`);

  const rows = await r.json();
  const map: Record<string, TeamInfo> = {};
  (rows || []).forEach((t: any) => {
    const abbr = teamKey(t?.Key || t?.Team || t?.Tricode || t?.Code || t?.Abbreviation);
    const name = t?.Name || t?.FullName || (t?.City && t?.Name ? `${t.City} ${t.Name}` : abbr);
    const logo = sanitizeUrl(t?.WikipediaLogoUrl) || sanitizeUrl(t?.TeamLogoUrl) || sanitizeUrl(t?.Logo);
    if (abbr) map[abbr] = { name, logo, abbr };
  });

  teamCache[sport] = map;
  return map;
}

/* ---------------- Schedule ---------------- */
export async function getGamesByDate(sport: SportKey, date: Date) {
  if (!KEY) throw new Error("SportsDataIO key missing");
  const cfg = API[sport];

  let url: string;
  if (sport === "nfl") {
    url = `${cfg.base}/${q(`${cfg.scoresByDate}/${iso(date)}`)}`; // NFL uses ScoresByDate
  } else {
    url = `${cfg.base}/${q(`${cfg.gamesByDate}/${iso(date)}`)}`;
  }

  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.text()) || `Games error ${r.status}`);
  return r.json();
}

/* ---------------- Betting odds ---------------- */
/** For NBA/MLB/NHL/WNBA: by date; for NFL: by season/week */
export async function getOddsByDate(
  sport: SportKey,
  date: Date
): Promise<Record<string, { mlHome?: number | null; mlAway?: number | null; spread?: number | null; total?: number | null }>> {
  if (!KEY) throw new Error("SportsDataIO key missing");

  const cfg = API[sport];

  // NFL: derive season/week from the day’s schedule, then call GameOddsByWeek/{season}/{week}
  if (sport === "nfl") {
    try {
      const dayRows = await getGamesByDate("nfl", date);
      const first = (dayRows || [])[0];
      if (!first) return {}; // no games that day
      const season = first.Season ?? first.SeasonType ?? first.SeasonYear ?? first.SeasonValue;
      const week = first.Week ?? first.WeekNumber ?? first.WeekValue;
      if (season == null || week == null) return {};

      const url = `${cfg.base}/${q(`${cfg.oddsByWeek}/${season}/${week}`)}`;
      const r = await fetch(url);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) throw new Error(`Plan does not support nfl odds`);
        if (r.status === 404) return {}; // odds not published yet or endpoint not in plan; don't fail UI
        throw new Error((await r.text()) || `Odds error ${r.status}`);
      }
      const rows = await r.json();
      return mapOdds(rows);
    } catch (e) {
      // If anything goes wrong, just return empty odds map so UI still works
      return {};
    }
  }

  // Other sports: by-date endpoint
  const url = `${cfg.base}/${q(`${cfg.oddsByDate}/${iso(date)}`)}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error(`Plan does not support ${sport} odds`);
    if (r.status === 404) return {};
    throw new Error((await r.text()) || `Odds error ${r.status}`);
  }
  const rows = await r.json();
  return mapOdds(rows);
}

function mapOdds(rows: any[]): Record<string, { mlHome?: number | null; mlAway?: number | null; spread?: number | null; total?: number | null }> {
  const map: Record<string, any> = {};
  (rows || []).forEach((g: any) => {
    const id = String(g.GameId ?? g.GameID ?? g.GlobalGameId ?? g.EventId ?? g.ScheduleId ?? "");
    if (!id) return;
    const books = g?.PregameOdds || g?.Odds || [];
    const best = books?.[0] || {};
    map[id] = {
      mlHome: best?.HomeMoneyLine ?? null,
      mlAway: best?.AwayMoneyLine ?? null,
      spread: best?.PointSpread ?? null,
      total: best?.OverUnder ?? null,
    };
  });
  return map;
}

/* ---------------- Normalizer ---------------- */
export function normalizeGame(sport: SportKey, g: any, teams?: Record<string, TeamInfo>) {
  const id = String(
    g.GameID ?? g.GameId ?? g.GlobalGameId ?? g.ScheduleId ?? `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime}`
  );

  const dtRaw = g.DateTimeUTC || g.DateTime || g.Day || g.Date || g.StartTime;
  const dt = dtRaw ? new Date(dtRaw) : null;

  const hk = teamKey(g.HomeTeam);
  const ak = teamKey(g.AwayTeam);

  const home = teams?.[hk]?.name || g.HomeTeam || hk;
  const away = teams?.[ak]?.name || g.AwayTeam || ak;

  const status = String(g.Status || g.GameStatus || "").toLowerCase();
  const bucket =
    status.includes("inprogress") || status.includes("in progress")
      ? "LIVE"
      : status.includes("final") || status.includes("complete")
      ? "FINAL"
      : dt && dt.getTime() > Date.now()
      ? "UPCOMING"
      : "UPCOMING";

  return {
    id,
    homeName: home,
    awayName: away,
    homeLogo: teams?.[hk]?.logo || null,
    awayLogo: teams?.[ak]?.logo || null,
    homeScore: g.HomeScore ?? null,
    awayScore: g.AwayScore ?? null,
    when: dt
      ? `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "",
    rawDate: dt ? dt.getTime() : 0,
    bucket,
  };
}
d 