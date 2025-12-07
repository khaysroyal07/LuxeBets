// supabase/functions/sync_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SportCode = "nba" | "nfl" | "mlb" | "nhl";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") || "";
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// 👇 Only NBA active for now
const ACTIVE_SPORTS: SportCode[] = [
  "nba",
  // "nfl",
  // "mlb",
  // "nhl",
];

const TZ = "America/New_York";

function toDayISO(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getYesterdayISO_ET(): string {
  const now = new Date();
  const nowET = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  nowET.setDate(nowET.getDate() - 1);
  nowET.setHours(0, 0, 0, 0);
  return toDayISO(nowET);
}

// Map sport → league code used in the SDIO URL
function leaguePathForSport(sport: SportCode): string {
  switch (sport) {
    case "nba":
      return "nba";
    case "nfl":
      return "nfl";
    case "mlb":
      return "mlb";
    case "nhl":
      return "nhl";
    default:
      return sport;
  }
}

/**
 * Fetch games for a given sport/day from SportsDataIO.
 */
async function fetchGamesFromSDIO(
  sport: SportCode,
  dayISO: string,
): Promise<any[]> {
  if (!SDIO_KEY) {
    console.warn(
      `[sync_results] No SPORTSDATAIO_KEY set; skipping sport=${sport}`,
    );
    return [];
  }

  const league = leaguePathForSport(sport);
  const url =
    `https://api.sportsdata.io/v3/${league}/scores/json/GamesByDate/${dayISO}`;

  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": SDIO_KEY,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(
      "[sync_results] SportsDataIO auth/availability issue",
      { sport, dayISO, status: res.status, txt },
    );
    return [];
  }

  const data = (await res.json().catch(() => [])) as any[];
  return Array.isArray(data) ? data : [];
}

/**
 * Map a SportsDataIO game object → a row for public.games
 */
function mapSDIOGameToRow(sport: SportCode, dayISO: string, g: any) {
  const leagueGameId =
    String(g.GlobalGameID ?? g.GameID ?? g.GameKey ?? g.ID ?? "");

  const startUtc = g.DateTime ?? g.DateTimeUTC ?? g.Day ?? null;

  const homeTeam = g.HomeTeam ?? g.HomeTeamID ?? g.Home ?? "";
  const awayTeam = g.AwayTeam ?? g.AwayTeamID ?? g.Away ?? "";

  let status = "scheduled";
  const s = String(g.Status ?? g.GameStatus ?? "").toLowerCase();
  if (s.includes("final")) status = "final";
  else if (s.includes("inprogress") || s.includes("in progress")) {
    status = "in_progress";
  }

  const homeScore =
    g.HomeTeamScore ??
    g.HomeScore ??
    g.HomeTeamRuns ??
    g.HomeGoals ??
    null;
  const awayScore =
    g.AwayTeamScore ??
    g.AwayScore ??
    g.AwayTeamRuns ??
    g.AwayGoals ??
    null;

  const league = g.League ?? g.SeasonType ?? null;
  const season = g.Season ?? null;

  return {
    league_game_id: leagueGameId,
    sport,
    game_day: dayISO,
    start_time_utc: startUtc ? new Date(startUtc).toISOString() : null,
    home_team: String(homeTeam),
    away_team: String(awayTeam),
    status,
    home_score: homeScore !== null ? Number(homeScore) : null,
    away_score: awayScore !== null ? Number(awayScore) : null,
    provider: "sportsdataio",
    league: league ? String(league) : null,
    season: season !== null && season !== undefined ? String(season) : null,
  };
}

async function syncDay(dayISO: string) {
  console.info(`[sync_results] Syncing games for day=${dayISO}`);
  let totalGames = 0;

  for (const sport of ACTIVE_SPORTS) {
    const games = await fetchGamesFromSDIO(sport, dayISO);
    if (!games.length) {
      console.info(
        `[sync_results] No games returned from SDIO for sport=${sport}, day=${dayISO}`,
      );
      continue;
    }

    const rows = games
      .map((g) => mapSDIOGameToRow(sport, dayISO, g))
      .filter((r) => r.league_game_id && r.home_team && r.away_team);

    if (!rows.length) continue;

    const { error } = await sb
      .from("games")
      .upsert(rows, { onConflict: "league_game_id" });

    if (error) {
      console.error(
        "[sync_results] Error upserting games",
        { sport, dayISO, error },
      );
    } else {
      console.info(
        `[sync_results] Upserted ${rows.length} games into games for sport=${sport}, day=${dayISO}`,
      );
      totalGames += rows.length;
    }
  }

  return { totalGames };
}

/**
 * Check if there are any ungraded picks for a given day.
 */
async function hasPendingPicksForDay(dayISO: string): Promise<boolean> {
  const { data, error } = await sb
    .from("picks")
    .select("id")
    .in("sport", ACTIVE_SPORTS)
    .eq("game_day", dayISO)
    .is("result", null)
    .limit(1);

  if (error) {
    console.error("[sync_results] Error checking pending picks", {
      dayISO,
      error,
    });
    // Fail-safe: treat as "yes" so we don't accidentally skip
    return true;
  }

  return !!(data && data.length > 0);
}

serve(async (req) => {
  try {
    let dayISO: string | undefined;
    let force = false;

    // Optional manual override via POST
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      dayISO = body?.dayISO;
      force = Boolean(body?.force);
    }

    // If no specific day given → default to "yesterday in ET"
    if (!dayISO) {
      dayISO = getYesterdayISO_ET();
    }

    // In cron mode (no force), only sync if there are pending picks
    if (!force) {
      const hasPending = await hasPendingPicksForDay(dayISO);
      if (!hasPending) {
        console.info(
          `[sync_results] No pending picks for day=${dayISO}, skipping sync.`,
        );
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: true,
            reason: "no-pending-picks",
            dayISO,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const { totalGames } = await syncDay(dayISO);

    return new Response(
      JSON.stringify({ ok: true, dayISO, totalGames }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync_results] top-level error", err);
    return new Response("Internal error in sync_results", { status: 500 });
  }
});
