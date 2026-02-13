// supabase/functions/sync_results/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type SportCode = "nba" | "nfl" | "mlb" | "nhl" | "wnba";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET") || Deno.env.get("FN_SECRET") || "";

// IMPORTANT: your dashboard secret is SPORTSDATAIO_KEY (not SPORTSDATAIO_API_KEY)
const SDIO_KEY =
  Deno.env.get("SPORTSDATAIO_API_KEY") ||
  Deno.env.get("SPORTSDATAIO_KEY") ||
  "";

const ACTIVE_SPORTS: SportCode[] = (Deno.env.get("SPORTS_ACTIVE") || "nba,nfl")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s): s is SportCode =>
    s === "nba" || s === "nfl" || s === "mlb" || s === "nhl" || s === "wnba"
  );

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function authOrNull(req: Request): Response | null {
  if (!FUNCTION_SECRET) return null;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) return new Response("Unauthorized", { status: 401 });
  return null;
}

const TZ = "America/New_York";
function toDayISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getYesterdayISO_ET(): string {
  const now = new Date();
  const nowET = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  nowET.setDate(nowET.getDate() - 1);
  nowET.setHours(0, 0, 0, 0);
  return toDayISO(nowET);
}
function isoNoZ(dt: string) {
  // normalize to "YYYY-MM-DDTHH:MM:SS" (no Z) — matches your pick key format
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toISOString().slice(0, 19);
}
function makeGameKey(away: string, home: string, startUtcISO: string) {
  return `${String(away).toUpperCase()}-${String(home).toUpperCase()}-${isoNoZ(startUtcISO)}`;
}

// ---- SportsDataIO endpoints (adjust if yours differ) ----
// These are common patterns; your existing function likely already had these.
// Keep your existing routes if they already work—this is focused on the KEY + game_key.
function sportPath(sport: SportCode): string {
  // If you already had a mapping, keep it. Examples:
  // NFL: https://api.sportsdata.io/v3/nfl/scores/json/ScoresByDate/{date}
  // NBA: https://api.sportsdata.io/v3/nba/scores/json/GamesByDate/{date}
  // etc.
  // We’ll assume:
  if (sport === "nfl") return "nfl/scores/json/ScoresByDate";
  if (sport === "nba") return "nba/scores/json/GamesByDate";
  if (sport === "mlb") return "mlb/scores/json/GamesByDate";
  if (sport === "nhl") return "nhl/scores/json/GamesByDate";
  if (sport === "wnba") return "wnba/scores/json/GamesByDate";
  return "nba/scores/json/GamesByDate";
}

async function fetchSDIOGamesByDate(sport: SportCode, dayISO: string) {
  if (!SDIO_KEY) throw new Error("Missing SPORTSDATAIO key (set SPORTSDATAIO_KEY in Edge Function secrets).");

  const url = `https://api.sportsdata.io/v3/${sportPath(sport)}/${dayISO}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": SDIO_KEY },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SportsDataIO ${sport} ${dayISO} failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return await res.json();
}

function normalizeGameRow(sport: SportCode, raw: any, dayISO: string) {
  // SportsDataIO fields vary slightly by sport; use your existing mapping if you already had one.
  const gameId = raw.GameID ?? raw.GameId ?? raw.gameId ?? raw.Id ?? raw.id;
  const home = raw.HomeTeam ?? raw.Home ?? raw.homeTeam ?? raw.HomeTeamKey;
  const away = raw.AwayTeam ?? raw.Away ?? raw.awayTeam ?? raw.AwayTeamKey;

  const startUtc =
    raw.DateTimeUTC ??
    raw.DateTimeUtc ??
    raw.UtcStartTime ??
    raw.StartTimeUTC ??
    raw.StartTimeUtc ??
    raw.Day ?? // fallback
    raw.DateTime;

  const homeScore = raw.HomeScore ?? raw.HomeTeamScore ?? raw.homeScore ?? null;
  const awayScore = raw.AwayScore ?? raw.AwayTeamScore ?? raw.awayScore ?? null;

  const status = String(raw.Status ?? raw.status ?? "").toLowerCase() || "scheduled";
  const start_time_utc = startUtc ? new Date(startUtc).toISOString() : null;

  const game_key = (home && away && start_time_utc)
    ? makeGameKey(away, home, start_time_utc)
    : null;

  return {
    sport,
    game_day: dayISO,              // date (ET day you asked for)
    league_game_id: String(gameId ?? "").trim() || null, // ALWAYS numeric string if SDIO provides it
    start_time_utc,
    home_team: String(home ?? "").toUpperCase() || null,
    away_team: String(away ?? "").toUpperCase() || null,
    home_score: typeof homeScore === "number" ? homeScore : (homeScore == null ? null : Number(homeScore)),
    away_score: typeof awayScore === "number" ? awayScore : (awayScore == null ? null : Number(awayScore)),
    status: status === "final" ? "final" : status,
    game_key, // ✅ the important part
  };
}

async function upsertGamesForDay(dayISO: string, sports: SportCode[]) {
  const inserted: Record<string, number> = {};
  for (const sport of sports) {
    const rawGames = await fetchSDIOGamesByDate(sport, dayISO);
    const rows = (rawGames ?? []).map((g: any) => normalizeGameRow(sport, g, dayISO))
      .filter((r: any) => r.home_team && r.away_team && r.start_time_utc);

    if (rows.length === 0) {
      inserted[sport] = 0;
      continue;
    }

    // Use (sport, league_game_id) if you already have a unique constraint on league_game_id per sport.
    // If not, upsert by id will still work if you store a stable id; but best is to keep your existing conflict target.
    // Here we assume you already upsert on (sport, league_game_id) or just on id. If not, add a constraint.
    const { error } = await sb.from("games").upsert(rows, {
      onConflict: "sport,league_game_id",
      ignoreDuplicates: false,
    });

    if (error) throw error;
    inserted[sport] = rows.length;
  }
  return inserted;
}

serve(async (req) => {
  const auth = authOrNull(req);
  if (auth) return auth;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const daysBack = Number.isFinite(Number(body?.daysBack)) ? Number(body.daysBack) : 1;

    // If dayISO provided, use it. Otherwise yesterday ET by default, then apply daysBack.
    let dayISO = typeof body?.dayISO === "string" ? body.dayISO.slice(0, 10) : getYesterdayISO_ET();
    if (daysBack && daysBack > 0) {
      const base = new Date(`${dayISO}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() - daysBack);
      dayISO = base.toISOString().slice(0, 10);
    }

    const s = String(body?.sport ?? "").toLowerCase().trim();
    const sports: SportCode[] =
      s === "nba" || s === "nfl" || s === "mlb" || s === "nhl" || s === "wnba"
        ? [s]
        : ACTIVE_SPORTS;

    const inserted = await upsertGamesForDay(dayISO, sports);

    return new Response(JSON.stringify({ ok: true, dayISO, sports, inserted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[sync_results] error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
