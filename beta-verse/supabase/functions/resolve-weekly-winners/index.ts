// supabase/functions/resolve-weekly-winners/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type EntryScore = {
  entry_id: string | number;
  user_id: string;
  correct_count: number;
  incorrect_count: number;
};

serve(async (req) => {
  // 🔐 Simple auth so only your cron/back-end can call this
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // 1) Tournaments whose week has ended and are still open/in_progress
    const { data: tournaments, error: tErr } = await supabase
      .from("tournaments")
      .select("id, end_iso, status")
      .lte("end_iso", now)
      .in("status", ["open", "in_progress"])
      .limit(100);

    if (tErr) {
      console.error("Error fetching tournaments:", tErr);
      return new Response("Error fetching tournaments", { status: 500 });
    }

    if (!tournaments || tournaments.length === 0) {
      return new Response("No tournaments to resolve", { status: 200 });
    }

    const resultSummary: any[] = [];

    for (const t of tournaments) {
      const tournamentId = t.id;

      // 2) All entries in this tournament
      const { data: entries, error: eErr } = await supabase
        .from("entries")
        .select("id, user_id")
        .eq("tournament_id", tournamentId);

      if (eErr) {
        console.error("Error fetching entries for tournament", tournamentId, eErr);
        continue;
      }

      if (!entries || entries.length === 0) {
        console.log("No entries for tournament", tournamentId);
        await supabase
          .from("tournaments")
          .update({ status: "resolved" })
          .eq("id", tournamentId);
        continue;
      }

      const scores: EntryScore[] = [];

      for (const entry of entries) {
        const entryId = entry.id;

        // 🔴🔴🔴 IMPORTANT: CHANGE THIS TO MATCH YOUR PICKS TABLE 🔴🔴🔴
        //
        // If your table is called "picks" or "tournament_picks" and uses
        //   - entry_id
        //   - result: 'win'|'loss' or 'correct'|'wrong'
        // update from() and .select(...) accordingly.
        //
        // Example for boolean:
        // .select("is_correct")
        // and then count based on that.

        const { data: picks, error: pErr } = await supabase
          .from("entry_picks")          // <-- CHANGE TABLE NAME IF NEEDED
          .select("result")             // <-- CHANGE COLUMN IF NEEDED
          .eq("entry_id", entryId);

        if (pErr) {
          console.error("Error fetching picks for entry", entryId, pErr);
          continue;
        }

        const list = picks ?? [];

        const correct = list.filter(
          (p: any) => p.result === "correct" || p.result === "win",
        ).length;

        const incorrect = list.filter(
          (p: any) => p.result === "wrong" || p.result === "loss",
        ).length;

        scores.push({
          entry_id: entryId,
          user_id: entry.user_id,
          correct_count: correct,
          incorrect_count: incorrect,
        });
      }

      if (scores.length === 0) {
        console.log("No scores for tournament", tournamentId);
        await supabase
          .from("tournaments")
          .update({ status: "resolved" })
          .eq("id", tournamentId);
        continue;
      }

      // 3) Determine best score:
      //    - highest correct_count
      //    - tie-breaker: fewest incorrect_count
      let maxCorrect = 0;
      for (const s of scores) {
        if (s.correct_count > maxCorrect) maxCorrect = s.correct_count;
      }

      const topScorers = scores.filter((s) => s.correct_count === maxCorrect);

      let minIncorrect = Infinity;
      for (const s of topScorers) {
        if (s.incorrect_count < minIncorrect) minIncorrect = s.incorrect_count;
      }

      const winners = topScorers.filter(
        (s) => s.incorrect_count === minIncorrect,
      );

      const winnerEntryIds = winners.map((w) => w.entry_id);

      // 4) Set everyone to finished first
      const { error: allUpdateErr } = await supabase
        .from("entries")
        .update({ status: "finished" })
        .eq("tournament_id", tournamentId);

      if (allUpdateErr) {
        console.error("Error marking entries finished:", allUpdateErr);
      }

      // 5) Mark winners
      if (winnerEntryIds.length > 0) {
        const { error: winnersErr } = await supabase
          .from("entries")
          .update({ status: "winner" })
          .in("id", winnerEntryIds);

        if (winnersErr) {
          console.error("Error marking winners:", winnersErr);
        }
      }

      // 6) Mark tournament as resolved
      const { error: tUpdateErr } = await supabase
        .from("tournaments")
        .update({ status: "resolved" })
        .eq("id", tournamentId);

      if (tUpdateErr) {
        console.error("Error marking tournament resolved:", tUpdateErr);
      }

      resultSummary.push({
        tournamentId,
        winnerEntryIds,
        maxCorrect,
        minIncorrect,
      });
    }

    return new Response(JSON.stringify({ ok: true, resultSummary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-weekly-winners error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
