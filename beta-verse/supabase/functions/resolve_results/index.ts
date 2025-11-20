// supabase/functions/resolve_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

type Outcome = "win" | "loss" | "push";

/**
 * POINTS HELPER
 * --------------
 * Only awards points on a WIN.
 *
 * odds <= -200  -> 1.0 pt   (big favorite)
 * -199..-120    -> 1.5 pts
 * -119..+119    -> 2.0 pts  (coin flip / default)
 * +120..+199    -> 3.0 pts  (medium dog)
 * >= +200       -> 4.0 pts  (big dog)
 */
function pointsForPick(americanOdds: number | null, outcome: Outcome): number {
  if (outcome !== "win") return 0;

  if (americanOdds == null || Number.isNaN(Number(americanOdds))) {
    // Default coin-flip
    return 2.0;
  }

  const odds = Number(americanOdds);

  if (odds <= -200) return 1.0;
  if (odds <= -120) return 1.5;
  if (odds < 120) return 2.0;
  if (odds < 200) return 3.0;
  return 4.0;
}

/** Treat game as final if status contains "final"/"finished"/"complete" */
function isFinalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("final") ||
    s === "finished" ||
    s === "complete" ||
    s === "completed"
  );
}

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1) Picks that have NOT been graded yet (result is null)
    const { data: ungradedPicks, error: pErr } = await sb
      .from("picks")
      .select(
        `
        id,
        league_game_id,
        sport,
        market,
        selection,
        american_odds,
        result,
        points
      `,
      )
      .is("result", null);

    if (pErr) throw pErr;

    // nothing to do: still recompute totals below anyway
    const ungraded = (ungradedPicks ?? []) as any[];

    // 2) Load all related games in one query
    const leagueIds = Array.from(
      new Set(
        ungraded
          .map((p) => p.league_game_id)
          .filter((id) => !!id),
      ),
    );

    let gameByLeagueId = new Map<string, any>();

    if (leagueIds.length > 0) {
      const { data: games, error: gErr } = await sb
        .from("games")
        .select(
          `
          id,
          league_game_id,
          sport,
          game_day,
          status,
          home_score,
          away_score
        `,
        )
        .in("league_game_id", leagueIds);

      if (gErr) throw gErr;

      gameByLeagueId = new Map<string, any>();
      for (const g of (games ?? []) as any[]) {
        if (g.league_game_id) {
          gameByLeagueId.set(String(g.league_game_id), g);
        }
      }
    }

    type UpdateRow = {
      id: string;
      result?: Outcome;
      is_correct?: boolean;
      points?: number;
      graded_at?: string;
      resolved_at?: string;
    };

    const updates: UpdateRow[] = [];
    const now = new Date().toISOString();

    // 3) Grade each ungraded pick
    for (const p of ungraded) {
      const leagueGameId = p.league_game_id
        ? String(p.league_game_id)
        : null;
      if (!leagueGameId) continue;

      const game = gameByLeagueId.get(leagueGameId);
      if (!game) continue; // no game row yet

      if (!isFinalStatus(game.status)) continue; // game not finished

      const homeScore = game.home_score != null
        ? Number(game.home_score)
        : NaN;
      const awayScore = game.away_score != null
        ? Number(game.away_score)
        : NaN;

      if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

      let outcome: Outcome;
      if (homeScore === awayScore) {
        outcome = "push";
      } else {
        const winnerSide = homeScore > awayScore ? "home" : "away";

        const sel = (p.selection || {}) as any;
        const pickSide = String(sel.side ?? "").toLowerCase();

        outcome = pickSide === winnerSide ? "win" : "loss";
      }

      const pts = pointsForPick(
        p.american_odds != null ? Number(p.american_odds) : null,
        outcome,
      );

      updates.push({
        id: p.id,
        result: outcome,
        is_correct: outcome === "win",
        points: pts,
        graded_at: now,
        resolved_at: now,
      });
    }

    // 4) Also handle any already-graded picks missing points (safety)
    const { data: gradedNoPoints, error: p2Err } = await sb
      .from("picks")
      .select("id, result, american_odds, points")
      .in("result", ["win", "loss", "push"])
      .is("points", null);

    if (p2Err) throw p2Err;

    for (const p of (gradedNoPoints ?? []) as any[]) {
      const res = String(p.result || "").toLowerCase() as Outcome;
      if (!["win", "loss", "push"].includes(res)) continue;

      const pts = pointsForPick(
        p.american_odds != null ? Number(p.american_odds) : null,
        res,
      );

      updates.push({
        id: p.id,
        points: pts,
        resolved_at: now,
      });
    }

    // 5) APPLY UPDATES — UPDATE ONLY, NO UPSERT
    let updatedCount = 0;
    for (const u of updates) {
      const { id, ...rest } = u;
      const { error: uErr, count } = await sb
        .from("picks")
        .update(rest)
        .eq("id", id)
        .select("id", { count: "exact", head: true });

      if (uErr) throw uErr;
      if (count) updatedCount += count;
    }

    // 6) RECOMPUTE entries.points_total FROM picks.points
    const { data: pickPoints, error: aggErr } = await sb
      .from("picks")
      .select("entry_id, points")
      .not("points", "is", null);

    if (aggErr) throw aggErr;

    const totals = new Map<string, number>();
    for (const row of (pickPoints ?? []) as any[]) {
      if (!row.entry_id) continue;
      const pts = Number(row.points ?? 0);
      const cur = totals.get(row.entry_id) ?? 0;
      totals.set(row.entry_id, cur + pts);
    }

    let entriesUpdated = 0;
    for (const [entryId, total] of totals.entries()) {
      const { error: eErr, count } = await sb
        .from("entries")
        .update({ points_total: total })
        .eq("id", entryId)
        .select("id", { count: "exact", head: true });

      if (eErr) throw eErr;
      if (count) entriesUpdated += count;
    }

    return new Response(
      JSON.stringify({
        updated_picks: updatedCount,
        updated_entries: entriesUpdated,
        message: "Picks graded, points resolved, leaderboard totals updated.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("resolve_results error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
