// supabase/functions/sync_games/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") || "";
const FN_SECRET = Deno.env.get("FN_SECRET") || "";

/**
 * Comma-separated list in env like: "NFL,NBA,MLB,NHL,WNBA"
 * You can turn leagues on/off here without code changes.
 */
const ENABLED_SPORTS_ENV = (Deno.env.get("SPORTS_ENABLED") ?? "NFL,NBA")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type SportKey = "nfl" | "nba" | "mlb" | "nhl" | "wnba";

const ALL_SPORTS: SportKey[] = ["nfl", "nba", "mlb", "nhl", "wnba"];

const SPORT_PATH: Record<SportKey, string> = {
  nfl: "nfl",
  nba: "nba",
  mlb: "mlb",
  nhl: "nhl",
  wnba: "wnba",
};

/* ---------- tiny helpers ---------- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fn-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

function checkAuth(req: Request): Response | null {
  if (!FN_SECRET) return null;
  const hdr =
    req.headers.get("x-fn-secret") ?? req.headers.get("X-Fn-Secret");
  if (hdr !== FN_SECRET) {
    return json({ ok: false, error: "Forbidden" }, 401);
  }
  return null;
}

function toDayISO(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTHS_ABBR = [
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

function toSDIODate(dayISO: string): string {
  const d = new Date(dayISO + "T00:00:00Z");
  return `${d.getUTCFullYear()}-${
    MONTHS_ABBR[d.getUTCMonth()]
  }-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* ---------- SportsDataIO fetch + normalize ---------- */

async function fetchSDIOGames(
  sport: SportKey,
  dayISO: string,
): Promise<any[]> {
  if (!SDIO_KEY) return [];
  const base = `https://api.sportsdata.io/v3/${SPORT_PATH[sport]}/scores/json`;
  const d = encodeURIComponent(toSDIODate(dayISO));

  const urls = [
    `${base}/ScoresByDate/${d}?key=${SDIO_KEY}`,
    `${base}/GamesByDate/${d}?key=${SDIO_KEY}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.log(
          "[sync_games] SDIO error",
          sport,
          dayISO,
          res.status,
          txt.slice(0, 200),
        );
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json) && json.length) return json;
    } catch (err) {
      console.log("[sync_games] fetch failed", sport, dayISO, String(err));
    }
  }

  return [];
}

function normalizeGame(
  sport: SportKey,
  g: any,
  dayISO: string,
) {
  const id = String(
    g?.GameID ??
      g?.GameId ??
      g?.GameKey ??
      g?.GlobalGameId ??
      `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`,
  );

  const dateStr = g?.Date ?? g?.Day ?? g?.DateTime;
  const startUtc = dateStr ? new Date(dateStr).toISOString() : null;

  const status = String(g?.Status ?? g?.GameStatus ?? "").toLowerCase();

  const hs =
    g?.HomeTeamScore ??
    g?.HomeScore ??
    g?.HomeTeamPoints ??
    g?.HomeTeamRuns ??
    null;
  const as =
    g?.AwayTeamScore ??
    g?.AwayScore ??
    g?.AwayTeamPoints ??
    g?.AwayTeamRuns ??
    null;

  return {
    league_game_id: id,
    sport,
    game_day: dayISO,
    start_time_utc: startUtc,
    home_team: g?.HomeTeam ?? null,
    away_team: g?.AwayTeam ?? null,
    status,
    final_home_score: hs,
    final_away_score: as,
  };
}

/**
 * Look at picks for that date, find which sports actually have pending picks.
 * Then intersect with ENABLED_SPORTS_ENV so we don't call leagues you don't pay for.
 */
async function detectSportsForDay(dayISO: string): Promise<SportKey[]> {
  const { data, error } = await sb
    .from("picks")
    .select("sport")
    .eq("day_date", dayISO)
    .is("result", null);

  if (error) {
    console.error("[sync_games] detectSportsForDay error", error);
    return [];
  }

  const used = new Set<string>();
  (data ?? []).forEach((row: any) => {
    if (row.sport) used.add(String(row.sport).toLowerCase());
  });

  const enabled = new Set(ENABLED_SPORTS_ENV);

  const result: SportKey[] = [];
  for (const s of ALL_SPORTS) {
    if (used.has(s) && enabled.has(s)) {
      result.push(s);
    }
  }

  return result;
}

/* ---------- MAIN ---------- */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const auth = checkAuth(req);
  if (auth) return auth;

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!SDIO_KEY) {
    return json(
      { ok: false, error: "SPORTSDATAIO_KEY missing" },
      500,
    );
  }

  try {
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const dayISO: string = body.date
      ? toDayISO(body.date)
      : toDayISO(new Date());

    // 1) If caller explicitly passes sports → use them
    let sports: SportKey[] | null = null;
    if (Array.isArray(body.sports) && body.sports.length) {
      sports = body.sports
        .map((s: any) => String(s).toLowerCase())
        .filter((s: string) =>
          ALL_SPORTS.includes(s as SportKey)
        ) as SportKey[];
    }

    // 2) Otherwise, auto-detect from picks
    if (!sports || sports.length === 0) {
      sports = await detectSportsForDay(dayISO);
    }

    // 3) Fallback: if still nothing, don't hit SDIO
    if (!sports || sports.length === 0) {
      return json({
        ok: true,
        upserted: 0,
        dayISO,
        message:
          "No enabled sports with pending picks for this day.",
      });
    }

    const rows: any[] = [];

    for (const sport of sports) {
      const arr = await fetchSDIOGames(sport, dayISO);
      console.log(
        `[sync_games] ${sport} ${dayISO} → ${arr.length} games`,
      );
      for (const g of arr) {
        rows.push(normalizeGame(sport, g, dayISO));
      }
    }

    if (rows.length === 0) {
      return json({
        ok: true,
        upserted: 0,
        dayISO,
        message: "No games returned from SportsDataIO.",
      });
    }

    const { error } = await sb
      .from("games")
      .upsert(rows, { onConflict: "league_game_id,sport" });

    if (error) {
      console.error("[sync_games] upsert error", error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json({
      ok: true,
      upserted: rows.length,
      dayISO,
      sports,
    });
  } catch (err: any) {
    console.error("[sync_games] unexpected error", err);
    return json(
      { ok: false, error: String(err?.message ?? err) },
      500,
    );
  }
});
