// lib/sportsApi.ts
import Constants from "expo-constants";

/** Which leagues we support on the client */
export type Sport = "mlb" | "nfl" | "nba";

/** Normalized game model your UI can render */
export type Game = {
  id: string;
  sport: Sport;
  home: string;
  away: string;
  start_utc: string; // ISO
  status?: string;
};

const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ??
  process.env.SPORTSDATAIO_KEY ??
  // optional: expo extra
  (Constants.expoConfig?.extra as any)?.SPORTSDATAIO_KEY ??
  (Constants.manifest2?.extra as any)?.SPORTSDATAIO_KEY ??
  null;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSdioDate = (iso: string) => {
  // SDIO likes YYYY-MMM-DD (UTC)
  const d = new Date(`${iso}T00:00:00Z`);
  const m = MONTHS[d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${dd}`;
};

async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const txt = await res.text();
  let json: any = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { /* leave as text */ }
  return { ok: res.ok, status: res.status, data: json ?? txt };
}

/** ---- SportsDataIO: try 1-2 endpoints per sport for the given date ---- */
async function getSdioForSport(sport: Sport, dateISO: string): Promise<Game[]> {
  if (!SDIO_KEY) {
    console.warn("[sportsApi] SDIO key missing (set EXPO_PUBLIC_SPORTSDATAIO_KEY).");
    return [];
  }

  const d = toSdioDate(dateISO);
  // Endpoints to try (some sports use ScoresByDate vs GamesByDate)
  const attempts: string[] = [];
  if (sport === "mlb") {
    attempts.push(`https://api.sportsdata.io/v3/mlb/scores/json/GamesByDate/${d}`);
  } else if (sport === "nba") {
    attempts.push(`https://api.sportsdata.io/v3/nba/scores/json/GamesByDate/${d}`);
  } else if (sport === "nfl") {
    attempts.push(`https://api.sportsdata.io/v3/nfl/scores/json/GamesByDate/${d}`);
    attempts.push(`https://api.sportsdata.io/v3/nfl/scores/json/ScoresByDate/${d}`);
  }

  for (const url of attempts) {
    const { ok, status, data } = await fetchJSON(url, {
      headers: { "Ocp-Apim-Subscription-Key": SDIO_KEY! },
    });

    if (!ok) {
      console.warn(`[sportsApi] SDIO ${sport} ${status} for ${url}`);
      continue;
    }
    if (!Array.isArray(data)) {
      console.warn(`[sportsApi] SDIO ${sport} unexpected payload.`);
      continue;
    }

    const games: Game[] = data.map((g: any) => {
      const start =
        g?.Day ||
        g?.DateTime ||
        g?.Date ||
        g?.DateTimeUTC ||
        new Date(`${dateISO}T00:00:00Z`).toISOString();

      // team keys vary across feeds; normalize best-effort
      const home =
        g?.HomeTeam ||
        g?.HomeTeamName ||
        g?.HomeTeamKey ||
        g?.Home ||
        g?.HomeTeamAbbr ||
        g?.HomeTeamID ||
        "HOME";
      const away =
        g?.AwayTeam ||
        g?.AwayTeamName ||
        g?.AwayTeamKey ||
        g?.Away ||
        g?.AwayTeamAbbr ||
        g?.AwayTeamID ||
        "AWAY";

      const id = String(
        g?.GameID ??
        g?.GlobalGameID ??
        g?.ScoreID ??
        `${sport}-${home}-${away}-${start}`
      );

      const status =
        g?.Status ??
        g?.GameStatus ??
        g?.Channel ??
        g?.StadiumDetails?.Name ??
        undefined;

      return {
        id,
        sport,
        home: String(home),
        away: String(away),
        start_utc: new Date(start).toISOString(),
        status,
      };
    });

    return games;
  }

  return [];
}

/** ---- TheSportsDB fallback: free, no key needed (for testing) ----
 * Docs: https://www.thesportsdb.com/api.php
 * We use a generic day-by-sport endpoint: /eventsday.php?d=YYYY-MM-DD&s=Basketball/Baseball/"American Football"
 */
function sportsDbName(s: Sport) {
  if (s === "mlb") return "Baseball";
  if (s === "nba") return "Basketball";
  return "American Football";
}
async function getSportsDb(sport: Sport, dateISO: string): Promise<Game[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateISO}&s=${encodeURIComponent(
    sportsDbName(sport)
  )}`;

  const { ok, status, data } = await fetchJSON(url);
  if (!ok) {
    console.warn(`[sportsApi] SportsDB ${sport} ${status}`);
    return [];
  }

  const events = (data && (data.events || data.event)) ?? [];
  if (!Array.isArray(events)) return [];

  return events.map((e: any) => {
    const home = e?.strHomeTeam || e?.strEvent?.split(" vs ")[0] || "HOME";
    const away = e?.strAwayTeam || e?.strEvent?.split(" vs ")[1] || "AWAY";
    const start = e?.dateEvent
      ? new Date(`${e.dateEvent}T${(e?.strTime ?? "00:00:00")}Z`).toISOString()
      : new Date(`${dateISO}T00:00:00Z`).toISOString();

    return {
      id: String(e?.idEvent ?? `${sport}-${home}-${away}-${start}`),
      sport,
      home,
      away,
      start_utc: start,
      status: e?.strStatus ?? e?.strLeague,
    } as Game;
  });
}

/** Public API used by your tournaments screen */
export async function getSlate(
  dateISO: string,
  leagues: Sport[]
): Promise<{ games: Game[]; source: string }> {
  const want = leagues.length ? leagues : (["mlb","nfl"] as Sport[]);
  let all: Game[] = [];

  // 1) Try SDIO (if key present)
  if (SDIO_KEY) {
    for (const s of want) {
      try {
        const g = await getSdioForSport(s, dateISO);
        all = all.concat(g);
      } catch (e) {
        console.warn(`[sportsApi] SDIO error ${s}:`, e);
      }
    }
    if (all.length) return { games: all.sort((a,b)=>a.start_utc.localeCompare(b.start_utc)), source: "sdio" };
  } else {
    console.warn("[sportsApi] No SDIO key, skipping SDIO and using fallback.");
  }

  // 2) Fallback: TheSportsDB (free)
  let fb: Game[] = [];
  for (const s of want) {
    try {
      const g = await getSportsDb(s, dateISO);
      fb = fb.concat(g);
    } catch (e) {
      console.warn(`[sportsApi] SportsDB error ${s}:`, e);
    }
  }
  return { games: fb.sort((a,b)=>a.start_utc.localeCompare(b.start_utc)), source: "sportsdb" };
}
