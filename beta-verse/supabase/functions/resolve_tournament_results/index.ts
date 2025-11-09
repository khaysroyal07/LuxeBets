// supabase/functions/resolve_tournament_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

serve(async (req) => {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const bodyTid = body.tournament_id as string | undefined;

    let tournamentId = bodyTid;
    if (!tournamentId) {
      const { data: tid, error: tidErr } = await sb.rpc("current_open_tournament_id");
      if (tidErr) {
        console.error("resolve_tournament_results: current_open_tournament_id error", tidErr);
      }
      tournamentId = tid ?? null;
    }

    if (!tournamentId) {
      console.log("resolve_tournament_results: NO_ACTIVE_TOURNAMENT, skipping.");
      return json({
        ok: true,
        skipped: true,
        reason: "NO_ACTIVE_TOURNAMENT",
      });
    }

    const { data: tRow, error: tErr } = await sb
      .from("tournaments")
      .select("id, status, end_date")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tRow) {
      console.log("resolve_tournament_results: Tournament not found, skipping.", tournamentId);
      return json({ ok: true, skipped: true, reason: "TOURNAMENT_NOT_FOUND" });
    }

    // Only close if we’re at/after end_date and not already closed
    if (tRow.status === "closed") {
      console.log("resolve_tournament_results: tournament already closed, skipping.", tournamentId);
      return json({ ok: true, skipped: true, reason: "ALREADY_CLOSED" });
    }

    if (new Date() < new Date(tRow.end_date)) {
      console.log("resolve_tournament_results: end_date not reached, skipping.", tournamentId);
      return json({ ok: true, skipped: true, reason: "END_NOT_REACHED" });
    }

    // ----------- your existing payout logic below ------------

    // Recompute leaderboard
    await sb.rpc("recompute_leaderboard_for_tournament", { _tournament_id: tournamentId });

    // Get final leaderboard
    const { data: lb, error: lbErr } = await sb
      .from("leaderboards")
      .select("user_id, points_total")
      .eq("tournament_id", tournamentId);

    if (lbErr) throw lbErr;

    const pot = await getTournamentPot(tournamentId);

    for (const row of lb ?? []) {
      const pts = row.points_total ?? 0;
      let share = 0;
      if (pts >= 20) share = 1.0;
      else if (pts >= 10) share = 0.5;
      else share = 0.25;

      const payout = pot * share;

      await sb.from("payouts").insert({
        tournament_id: tournamentId,
        user_id: row.user_id,
        points_total: pts,
        payout,
      });
    }

    await sb.from("tournaments").update({ status: "closed" }).eq("id", tournamentId);

    return json({ ok: true, tournament_id: tournamentId, pot, players: (lb ?? []).length });
  } catch (e: any) {
    console.error("resolve_tournament_results error", e);
    return json({ ok: false, error: e.message ?? String(e) }, 500);
  }
});

async function getTournamentPot(id: string): Promise<number> {
  const { data } = await sb
    .from("entries")
    .select("entry_fee")
    .eq("tournament_id", id);

  const total = (data ?? []).reduce((acc: number, e: any) => acc + (e.entry_fee ?? 0), 0);
  return total;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
