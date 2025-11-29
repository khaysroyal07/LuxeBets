// supabase/functions/sync_results/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET")!; // "luxebets2025"
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// All leagues you care about right now
type SportKey = "nba" | "nfl" | "mlb" | "nhl" | "wnba";
const ALL_SPORTS: SportKey[] = ["nba", "nfl", "mlb", "nhl", "wnba"];

const SDIO_BASE = "https://api.sportsdata.io/v3";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-fn-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function checkSecret(req: Request): Response | null {
  const header = req.headers.get("x-fn-secret");
  if (!header || header !== FN_SECRET) {
    return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders(),
    });
  }
  return null;
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/** Map sport key to SDIO path segment */
function sportPath(sport: SportKey): string {
  switch (sport) {
    case "nba":
      return "nba";
    case "nfl":
      return "nfl";
    case "mlb":
      return "mlb";
    case "nhl":
      return "nhl";
    case "wnba":
      return "wnba";
    default:
      return sport;
  }
}

/**
 * Fetch games + scores for given sport + date from SportsDataIO.
 * Uses GamesByDate-style endpoints:
 *   /{sport}/scores/json/GamesByDate/YYYY-MMM-DD
 */
async function fetchGamesForDay(
  sport: SportKey,
  dayISO: string,
): Promise<any[]> {
  const d = new Date(dayISO);
  const year = d.getUTCFullYear();
  const monthNames = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const dateStr = `${year}-${monthNames[d.getUTCMonth()]}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;

  const path = sportPath(sport);
  const url = `${SDIO_BASE}/${path}/scores/json/GamesByDate/${dateStr}`;

  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": SDIO_KEY,
    },
  });

  // Handle "not authorized / not available" gracefully: just log and return []
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    const txt = await res.text().catch(() => "");
    console.error("SportsDataIO auth/availability issue", {
      sport,
      dayISO,
      status: res.status,
      txt,
    });
    return [];
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("SportsDataIO error", { sport, dayISO, status: res.status, txt });
    throw new Error(`SportsDataIO error ${sport} ${dayISO} ${res.status}`);
  }

  const data = (await res.json()) as any[];
  return data;
}

async function upsertGamesForDay(
  sport: SportKey,
  dayISO: string,
): Promise<number> {
  const apiGames = await fetchGamesForDay(sport, dayISO);
  if (!apiGames.length) return 0;

  const rows = apiGames
    .map((g) => {
      const leagueGameId = String(g.GameID ?? g.GlobalGameID ?? "");
      if (!leagueGameId) return null;

      const status =
        (g.Status ?? "").toString().toLowerCase().trim() || "scheduled";
      const gameDay = (g.Day ?? g.Date ?? dayISO).slice(0, 10);

      return {
        league_game_id: leagueGameId,
        sport,
        game_day: gameDay,
        start_time_utc: g.DateTime ? new Date(g.DateTime).toISOString() : null,
        home_team: g.HomeTeam ?? "",
        away_team: g.AwayTeam ?? "",
        status,
        home_score:
          typeof g.HomeTeamScore === "number" ? g.HomeTeamScore : null,
        away_score:
          typeof g.AwayTeamScore === "number" ? g.AwayTeamScore : null,
        provider: "sportsdataio",
        league: g.SeasonType ? String(g.SeasonType) : null,
        season: g.Season ? String(g.Season) : null,
      };
    })
    .filter((r) => r && r.home_team && r.away_team) as any[];

  if (!rows.length) return 0;

  const { error } = await sb
    .from("games")
    .upsert(rows, { onConflict: "league_game_id" });

  if (error) {
    console.error("upsert games error", sport, dayISO, error);
    throw error;
  }

  return rows.length;
}

/**
 * Targeted mode: look at picks with result IS NULL and league_game_id NOT NULL,
 * and only call SportsDataIO for (sport, game_day) combos that actually have
 * pending picks. This dramatically cuts down API calls.
 */
async function targetedSync(daysBack: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceISO = toISODate(since);

  // Distinct sport/game_day where we have pending picks with a league_game_id
  const { data, error } = await sb
    .from("picks")
    .select("sport, game_day")
    .is("result", null)
    .not("league_game_id", "is", null)
    .gte("game_day", sinceISO)
    .in("sport", ALL_SPORTS as string[])
    .order("game_day");

  if (error) {
    console.error("targetedSync: error loading pending picks", error);
    throw error;
  }

  if (!data || !data.length) {
    return { upserted: 0, perSport: {} as Record<string, number> };
  }

  // Build map: sport -> Set<dayISO>
  const combos = new Map<SportKey, Set<string>>();
  for (const row of data as { sport: SportKey; game_day: string }[]) {
    const s = row.sport as SportKey;
    if (!ALL_SPORTS.includes(s)) continue;
    const dayISO = row.game_day;
    if (!combos.has(s)) combos.set(s, new Set<string>());
    combos.get(s)!.add(dayISO);
  }

  const perSport: Record<string, number> = {};
  let total = 0;

  for (const [sport, daySet] of combos.entries()) {
    for (const dayISO of daySet) {
      try {
        const count = await upsertGamesForDay(sport, dayISO);
        if (!perSport[sport]) perSport[sport] = 0;
        perSport[sport] += count;
        total += count;
        console.log("Upserted games (targeted)", { sport, dayISO, count });
      } catch (e) {
        console.error("Failed upsert (targeted)", {
          sport,
          dayISO,
          error: String(e),
        });
      }
    }
  }

  return { upserted: total, perSport };
}

/**
 * Full mode: original behavior – loop over all sports x daysBack.
 * You can trigger this manually with a body flag when you really need it.
 */
async function fullSync(daysBack: number, sportsOverride?: SportKey[]) {
  const sports = sportsOverride && sportsOverride.length
    ? sportsOverride
    : ALL_SPORTS;

  const now = new Date();
  const dayISOs: string[] = [];
  for (let offset = 0; offset <= daysBack; offset++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - offset);
    dayISOs.push(toISODate(d));
  }

  const perSport: Record<string, number> = {};
  let total = 0;

  for (const sport of sports) {
    for (const dayISO of dayISOs) {
      try {
        const count = await upsertGamesForDay(sport, dayISO);
        if (!perSport[sport]) perSport[sport] = 0;
        perSport[sport] += count;
        total += count;
        console.log("Upserted games (full)", { sport, dayISO, count });
      } catch (e) {
        console.error("Failed upsert (full)", {
          sport,
          dayISO,
          error: String(e),
        });
      }
    }
  }

  return { upserted: total, perSport };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders() });
  }

  const forbidden = checkSecret(req);
  if (forbidden) return forbidden;

  try {
    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Default: look back 5 days
    const daysBack: number =
      typeof body.days_back === "number" && body.days_back >= 0
        ? body.days_back
        : 5;

    // full_scan: true -> run the old "all sports x days" behavior
    const fullScan: boolean = body.full_scan === true;

    // Optional override list of sports for full scan
    let sportsOverride: SportKey[] | undefined;
    if (fullScan && Array.isArray(body.sports) && body.sports.length) {
      const filtered = (body.sports as string[]).filter(
        (s): s is SportKey => (ALL_SPORTS as string[]).includes(s),
      );
      if (filtered.length) sportsOverride = filtered;
    }

    let result;
    if (fullScan) {
      result = await fullSync(daysBack, sportsOverride);
    } else {
      result = await targetedSync(daysBack);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: fullScan ? "full" : "targeted",
        upserted: result.upserted,
        per_sport: result.perSport,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  } catch (err) {
    console.error("sync_results fatal", err);
    return new Response("Internal error", {
      status: 500,
      headers: corsHeaders(),
    });
  }
});
