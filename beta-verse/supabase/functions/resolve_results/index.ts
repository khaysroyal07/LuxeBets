// supabase/functions/resolve_results/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET")!; // "luxebets2025"

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// 🔴 Make sure these match your public.pick_result enum values
const RESULT_WIN = "win";
const RESULT_LOSS = "loss";
const RESULT_PUSH = "push";

type GameRow = {
  league_game_id: string;
  sport: string;
  game_day: string;
  status: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
};

type PickRow = {
  id: string;
  league_game_id: string | null;
  sport: string;
  game_day: string;
  market: string;
  selection: any;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-fn-secret",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function isFinal(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  // SportsDataIO sometimes uses "Final", "F/OT", etc.
  return (
    s.includes("final") ||
    s === "closed" ||
    s === "complete" ||
    s.startsWith("f/")
  );
}

/**
 * Grade by side only (home/away), ignoring team letters ("R", "S", etc).
 * This works for both moneyline and spread with your current data.
 */
function gradeSide(side: string, game: GameRow) {
  if (game.home_score == null || game.away_score == null) return null;

  const s = side.toLowerCase();
  const homeWins = game.home_score > game.away_score;
  const awayWins = game.away_score > game.home_score;

  if (!homeWins && !awayWins) {
    // tie -> treat as push
    return { result: RESULT_PUSH, is_correct: false, points: 0 };
  }

  if (s === "home" || s === "h") {
    if (homeWins) {
      return { result: RESULT_WIN, is_correct: true, points: 1 };
    } else {
      return { result: RESULT_LOSS, is_correct: false, points: 0 };
    }
  }

  if (s === "away" || s === "a") {
    if (awayWins) {
      return { result: RESULT_WIN, is_correct: true, points: 1 };
    } else {
      return { result: RESULT_LOSS, is_correct: false, points: 0 };
    }
  }

  return null;
}

/**
 * For totals we *don't have the line* in your selection JSON right now.
 * To avoid "Pending forever", we mark them as a 0-point PUSH.
 * (You can upgrade this later once you store the total line.)
 */
function gradeTotalPlaceholder(side: string, game: GameRow) {
  if (game.home_score == null || game.away_score == null) return null;

  // Just mark as graded, 0 points.
  return { result: RESULT_PUSH, is_correct: false, points: 0 };
}

function computeGrade(pick: PickRow, game: GameRow) {
  if (!isFinal(game.status)) return null;
  if (game.home_score == null || game.away_score == null) return null;

  const sel = pick.selection || {};
  const market = String(pick.market || "").toLowerCase();
  const side: string =
    sel.side ??
    sel.s ??
    sel.bet ??
    "";

  if (!side) return null;

  if (market === "ml" || market === "moneyline") {
    return gradeSide(side, game);
  }

  if (market === "spread") {
    // Using side (home/away), ignoring actual spread line for now.
    return gradeSide(side, game);
  }

  if (market === "total" || market === "totals" || market === "ou") {
    return gradeTotalPlaceholder(side, game);
  }

  // Unknown market -> skip
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders() });
  }

  const forbidden = checkSecret(req);
  if (forbidden) return forbidden;

  try {
    // 1) Load all ungraded picks for the last 7 days
    const daysBack = 7;
    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - daysBack);
    const sinceISO = sinceDate.toISOString().slice(0, 10);

    const { data: picks, error: picksErr } = await sb
      .from("picks")
      .select("id, league_game_id, sport, game_day, market, selection")
      .is("result", null)
      .gte("game_day", sinceISO)
      .limit(1000);

    if (picksErr) {
      console.error("load picks error", picksErr);
      return new Response("Error loading picks", {
        status: 500,
        headers: corsHeaders(),
      });
    }

    if (!picks || !picks.length) {
      return new Response(
        JSON.stringify({ ok: true, graded: 0, reason: "no ungraded picks" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    const leagueIds = Array.from(
      new Set(
        picks
          .map((p: any) => p.league_game_id)
          .filter((x: any) => typeof x === "string" && x.length > 0),
      ),
    );

    if (!leagueIds.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          graded: 0,
          reason: "no league_game_ids on picks",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    // 2) Load the matching games
    const { data: games, error: gamesErr } = await sb
      .from("games")
      .select(
        "league_game_id, sport, game_day, status, home_team, away_team, home_score, away_score",
      )
      .in("league_game_id", leagueIds);

    if (gamesErr) {
      console.error("load games error", gamesErr);
      return new Response("Error loading games", {
        status: 500,
        headers: corsHeaders(),
      });
    }

    const gameMap = new Map<string, GameRow>();
    (games ?? []).forEach((g: any) => {
      if (g.league_game_id) {
        gameMap.set(g.league_game_id, g as GameRow);
      }
    });

    // 3) Grade picks
    const updates: {
      id: string;
      result: string;
      is_correct: boolean;
      points: number;
      graded_at: string;
      resolved_at: string;
    }[] = [];

    for (const p of picks as PickRow[]) {
      if (!p.league_game_id) continue;
      const g = gameMap.get(p.league_game_id);
      if (!g) continue;

      const grade = computeGrade(p, g);
      if (!grade) continue;

      updates.push({
        id: p.id,
        result: grade.result,
        is_correct: grade.is_correct,
        points: grade.points,
        graded_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      });
    }

    if (!updates.length) {
      return new Response(
        JSON.stringify({ ok: true, graded: 0, reason: "no gradeable picks" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    // 4) Persist updates using UPDATE (no upsert, avoids entry_id issue)
    let updatedCount = 0;
    for (const u of updates) {
      const { error: updErr } = await sb
        .from("picks")
        .update({
          result: u.result,
          is_correct: u.is_correct,
          points: u.points,
          graded_at: u.graded_at,
          resolved_at: u.resolved_at,
        })
        .eq("id", u.id);

      if (updErr) {
        console.error("update single pick error", u.id, updErr);
        continue;
      }
      updatedCount++;
    }

    return new Response(
      JSON.stringify({ ok: true, graded: updatedCount }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      },
    );
  } catch (err) {
    console.error("resolve_results fatal", err);
    return new Response("Internal error", {
      status: 500,
      headers: corsHeaders(),
    });
  }
});
