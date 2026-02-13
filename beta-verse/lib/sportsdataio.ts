import { supabase } from "@/lib/supabase";

export type SportKey = "nfl" | "nba" | "mlb" | "nhl" | "wnba";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sanitizeUrl = (u?: string | null) =>
  u && u.startsWith("http://") ? `https://${u.slice(7)}` : u || null;

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

async function callEdge<T>(body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sportsdata", { body });
  if (error) throw error;
  if (!data) throw new Error("No response from sportsdata edge function");

  // plan blocked: return empty so UI doesn't crash
  if (data.ok === false && data.planBlocked) {
    if (String(body?.op || "").toLowerCase().includes("odds")) return ({} as unknown) as T;
    return ([] as unknown) as T;
  }

  return data.data as T;
}

/* ---------------- Teams (with cache) ---------------- */
type TeamInfo = { name: string; logo?: string | null; abbr: string };
const teamCache: Partial<Record<SportKey, Record<string, TeamInfo>>> = {};
const teamKey = (v: string | null | undefined) => String(v || "").trim().toUpperCase();

export async function getTeams(sport: SportKey): Promise<Record<string, TeamInfo>> {
  if (teamCache[sport]) return teamCache[sport]!;

  const rows = await callEdge<any[]>({ op: "teams", sport });

  const map: Record<string, TeamInfo> = {};
  (rows || []).forEach((t: any) => {
    const abbr = teamKey(t?.Key || t?.Team || t?.Tricode || t?.Code || t?.Abbreviation);
    const name = t?.Name || t?.FullName || (t?.City && t?.Name ? `${t.City} ${t.Name}` : abbr);
    const logo =
      sanitizeUrl(t?.WikipediaLogoUrl) ||
      sanitizeUrl(t?.TeamLogoUrl) ||
      sanitizeUrl(t?.Logo);
    if (abbr) map[abbr] = { name, logo, abbr };
  });

  teamCache[sport] = map;
  return map;
}

/* ---------------- Schedule ---------------- */
export async function getGamesByDate(sport: SportKey, date: Date) {
  return callEdge<any[]>({ op: "gamesByDate", sport, date: iso(date) });
}

/* ---------------- Odds ---------------- */
export async function getOddsByDate(
  sport: SportKey,
  date: Date
): Promise<Record<string, { mlHome?: number | null; mlAway?: number | null; spread?: number | null; total?: number | null }>> {
  // NFL -> derive season/week from the schedule first
  if (sport === "nfl") {
    try {
      const dayRows = await getGamesByDate("nfl", date);
      const first = (dayRows || [])[0];
      if (!first) return {};

      const season = first.Season ?? first.SeasonType ?? first.SeasonYear ?? first.SeasonValue;
      const week = first.Week ?? first.WeekNumber ?? first.WeekValue;
      if (season == null || week == null) return {};

      const rows = await callEdge<any[]>({
        op: "oddsByWeek",
        sport: "nfl",
        season,
        week,
      });

      return mapOdds(rows);
    } catch {
      return {};
    }
  }

  // Other sports -> odds by date
  const rows = await callEdge<any[]>({ op: "oddsByDate", sport, date: iso(date) });
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
