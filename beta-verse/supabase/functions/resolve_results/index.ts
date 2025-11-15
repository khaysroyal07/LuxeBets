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
 * -119..+119    -> 2.0 pts  (coin flip)
 * +120..+199    -> 3.0 pts  (medium dog)
 * >= +200       -> 4.0 pts  (big dog)
 */
function pointsForPick(
  americanOdds: number | null,
  outcome: Outcome,
): number {
  if (outcome !== "win") return 0;

  const odds = Number(americanOdds ?? 0);

  if (odds <= -200) return 1.0;
  if (odds <= -120) return 1.5;
  if (odds < 120) return 2.0;
  if (odds < 200) return 3.0;
  return 4.0;
}

/**
 * Decide outcome from scores + selection
 */
function resolveOutcome(
  selection: "home" | "away",
  homeScore: number | null,
  awayScore: number | null,
): Outcome {
  const h = Number(homeScore ?? 0);
  const a = Number(awayScore ?? 0);

  if (h === a) return "push";

  const pickedHome = selection === "home";
  const homeWon = h > a;
  const pickedWon = (pickedHome && homeWon) || (!pickedHome && !homeWon);

  return pickedWon ? "win" : "loss";
}

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1) All pending picks
    const { data: pendingPicks, error: pErr } = await sb
      .from("picks")
      .select("id, selection, american_odds, game_id, result")
      .in("result", ["pending", "PENDING"]); // allow old uppercase data
    if (pErr) throw pErr;

    if (!pendingPicks || pendingPicks.length === 0) {
      return new Response(
        JSON.stringify({ updated: 0, message: "No pending picks." }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 2) Get games for those picks
    const gameIds = Array.from(
      new Set(pendingPicks.map((p: any) => p.game_id).filter(Boolean)),
    );

    if (gameIds.length === 0) {
      return new Response(
        JSON.stringify({ updated: 0, message: "No games found for pending picks." }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: games, error: gErr } = await sb
      .from("games")
      .select("id, status, home_score, away_score")
      .in("id", gameIds);
    if (gErr) throw gErr;

    const gameMap = new Map<string, any>();
    (games || []).forEach((g: any) => gameMap.set(String(g.id), g));

    // 3) Resolve each pick
    let updatedCount = 0;

    for (const p of pendingPicks as any[]) {
      const g = gameMap.get(String(p.game_id));
      if (!g) continue;

      if (String(g.status).toLowerCase() !== "final") continue;

      const outcome: Outcome = resolveOutcome(
        p.selection as "home" | "away",
        g.home_score,
        g.away_score,
      );

      const pts = pointsForPick(p.american_odds, outcome);

      const { error: uErr } = await sb
        .from("picks")
        .update({
          result: outcome, // lowercase matches pick_result enum
          points: pts,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      if (uErr) {
        console.error("Failed to update pick", p.id, uErr.message);
        continue;
      }

      updatedCount++;
    }

    return new Response(
      JSON.stringify({ updated: updatedCount }),
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
