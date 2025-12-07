// supabase/functions/resolve_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SportCode = "nba" | "nfl" | "mlb" | "nhl";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// ENV: which sports are active
const ACTIVE_SPORTS_ENV = Deno.env.get("SPORTS_ACTIVE");
const ACTIVE_SPORTS: SportCode[] =
  (ACTIVE_SPORTS_ENV
    ? ACTIVE_SPORTS_ENV.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is SportCode =>
          s === "nba" || s === "nfl" || s === "mlb" || s === "nhl"
        )
    : ["nba"]) || ["nba"];

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

/**
 * Map picks.selection → "home" | "away" | null
 * Handles:
 *  - selection = { side: "home" | "away", team: "UTA", ... }
 *  - selection = "home"/"away"
 *  - selection = "UTA"/"HOU" or abbreviations
 */
function selectionToSide(
  selection: any,
  homeTeam: string,
  awayTeam: string,
): "home" | "away" | null {
  // 1) If it's an object with a side field, trust that first
  if (selection && typeof selection === "object") {
    const rawSide =
      (selection.side ?? selection.Side ?? selection.SIDE) as
        | string
        | undefined;
    if (rawSide) {
      const sideNorm = String(rawSide).trim().toLowerCase();
      if (sideNorm === "home" || sideNorm === "h") return "home";
      if (sideNorm === "away" || sideNorm === "a") return "away";
    }

    // fallback: try its "team" field vs home/away
    const rawTeam =
      (selection.team ?? selection.Team ?? selection.TEAM) as
        | string
        | undefined;
    if (rawTeam) {
      const t = String(rawTeam).trim().toLowerCase();
      const home = homeTeam.trim().toLowerCase();
      const away = awayTeam.trim().toLowerCase();

      if (t === home) return "home";
      if (t === away) return "away";

      const onlyLetters = (x: string) => x.replace(/[^a-z]/gi, "");
      const t2 = onlyLetters(t);
      const home2 = onlyLetters(home);
      const away2 = onlyLetters(away);
      if (t2 && t2 === home2) return "home";
      if (t2 && t2 === away2) return "away";
    }
  }

  // 2) Otherwise treat selection as a primitive and try string logic
  const s = String(selection ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;

  if (s === "home" || s === "h") return "home";
  if (s === "away" || s === "a") return "away";

  const home = homeTeam.trim().toLowerCase();
  const away = awayTeam.trim().toLowerCase();

  if (s === home) return "home";
  if (s === away) return "away";

  const onlyLetters = (x: string) => x.replace(/[^a-z]/gi, "");
  const s2 = onlyLetters(s);
  const home2 = onlyLetters(home);
  const away2 = onlyLetters(away);

  if (s2 && s2 === home2) return "home";
  if (s2 && s2 === away2) return "away";

  return null;
}

async function gradeDay(dayISO: string) {
  // 1) Get all completed games for that day
  const { data: games, error: gamesErr } = await sb
    .from("games")
    .select("*")
    .in("sport", ACTIVE_SPORTS)
    .eq("game_day", dayISO)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (gamesErr) {
    console.error("[resolve_results] Error fetching games", {
      dayISO,
      gamesErr,
    });
    throw gamesErr;
  }

  if (!games || games.length === 0) {
    console.log("[resolve_results] No completed games to grade on", dayISO);
    return { gamesProcessed: 0, picksUpdated: 0 };
  }

  let totalPicksUpdated = 0;
  const nowISO = new Date().toISOString();

  for (const g of games as any[]) {
    const sport: SportCode = g.sport;
    const leagueGameId: string = g.league_game_id;
    const homeTeam: string = g.home_team;
    const awayTeam: string = g.away_team;
    const homeScore: number = g.home_score;
    const awayScore: number = g.away_score;

    let winnerSide: "home" | "away" | null = null;
    let isTie = false;

    if (homeScore > awayScore) {
      winnerSide = "home";
    } else if (awayScore > homeScore) {
      winnerSide = "away";
    } else {
      isTie = true;
    }

    // 2) Grab all ungraded picks tied to this game
    const { data: picks, error: picksErr } = await sb
      .from("picks")
      .select("id, selection")
      .eq("sport", sport)
      .eq("game_day", dayISO)
      .eq("league_game_id", leagueGameId)
      .is("result", null);

    if (picksErr) {
      console.error("[resolve_results] Error fetching picks for game", {
        sport,
        dayISO,
        leagueGameId,
        picksErr,
      });
      continue;
    }

    if (!picks || picks.length === 0) {
      continue;
    }

    const winIds: string[] = [];
    const loseIds: string[] = [];
    const pushIds: string[] = [];

    if (isTie) {
      // all picks are pushes
      for (const p of picks as any[]) {
        pushIds.push(p.id);
      }
    } else {
      for (const p of picks as any[]) {
        const side = selectionToSide(p.selection, homeTeam, awayTeam);
        if (!side) {
          console.log("[resolve_results] Unknown selection, skipping pick", {
            pickId: p.id,
            selection: p.selection,
            homeTeam,
            awayTeam,
          });
          continue;
        }
        if (side === winnerSide) {
          winIds.push(p.id);
        } else {
          loseIds.push(p.id);
        }
      }
    }

    // 3) Apply updates

    if (pushIds.length > 0) {
      const { error } = await sb
        .from("picks")
        .update({
          result: "push",
          is_correct: null,
          points: 0,
          graded_at: nowISO,
          resolved_at: nowISO,
        })
        .in("id", pushIds);

      if (error) {
        console.error("[resolve_results] Error updating push picks", {
          sport,
          dayISO,
          leagueGameId,
          error,
        });
      } else {
        totalPicksUpdated += pushIds.length;
      }
    }

    if (winIds.length > 0) {
      const { error } = await sb
        .from("picks")
        .update({
          result: "win",
          is_correct: true,
          points: 1, // change if you want different scoring
          graded_at: nowISO,
          resolved_at: nowISO,
        })
        .in("id", winIds);

      if (error) {
        console.error("[resolve_results] Error updating winner picks", {
          sport,
          dayISO,
          leagueGameId,
          error,
        });
      } else {
        totalPicksUpdated += winIds.length;
      }
    }

    if (loseIds.length > 0) {
      const { error } = await sb
        .from("picks")
        .update({
          result: "loss", // 👈 enum requires "loss", not "lose"
          is_correct: false,
          points: 0,
          graded_at: nowISO,
          resolved_at: nowISO,
        })
        .in("id", loseIds);

      if (error) {
        console.error("[resolve_results] Error updating loser picks", {
          sport,
          dayISO,
          leagueGameId,
          error,
        });
      } else {
        totalPicksUpdated += loseIds.length;
      }
    }
  }

  return {
    gamesProcessed: (games as any[]).length,
    picksUpdated: totalPicksUpdated,
  };
}

serve(async (req) => {
  try {
    let dayISO: string | undefined;

    // Optional manual override: POST { "dayISO": "YYYY-MM-DD" }
    if (req.method === "POST") {
      try {
        const body = await req.json();
        dayISO = body?.dayISO;
      } catch {
        // ignore bad JSON
      }
    }

    // Default to "yesterday in ET" (used by cron)
    if (!dayISO) {
      dayISO = getYesterdayISO_ET();
    }

    const result = await gradeDay(dayISO);

    return new Response(
      JSON.stringify({ ok: true, dayISO, ...result }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[resolve_results] top-level error", err);
    return new Response("Internal error in resolve_results", { status: 500 });
  }
});
