// supabase/functions/resolve_day/index.ts
// POINTS-ONLY RESOLVER (no elimination)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

type PickRow = {
  entry_id: string;
  game_day: string | null;
  is_correct: boolean | null;
  difficulty: string | null;
};

// --- helpers ---

function yesterdayUTCISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function difficultyPoints(diff: string | null): number {
  switch ((diff || "").toLowerCase()) {
    case "medium":
      return 2;
    case "hard":
      return 3;
    case "extreme":
      return 5;
    case "easy":
    default:
      return 1;
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      day?: string;
    };

    // TARGET_DAY is the last day we want to include in cumulative scoring.
    const TARGET_DAY = body.day ?? yesterdayUTCISO(); // 'YYYY-MM-DD'

    console.log("[resolve_day] running for TARGET_DAY:", TARGET_DAY);

    // 1) Pull ALL picks up to and including TARGET_DAY.
    //    We only care about whether they were correct and what difficulty.
    const { data: picks, error: picksErr } = await sb
      .from("picks")
      .select("entry_id, game_day, is_correct, difficulty")
      .lte("game_day", TARGET_DAY);

    if (picksErr) {
      console.error("[resolve_day] picksErr", picksErr);
      return new Response(
        JSON.stringify({ error: picksErr.message }),
        { status: 500 },
      );
    }

    const rows = (picks ?? []) as PickRow[];

    // 2) Aggregate points per entry (cumulative over all days <= TARGET_DAY).
    const pointsByEntry = new Map<string, number>();

    for (const p of rows) {
      if (!p.entry_id) continue;
      if (!p.is_correct) continue; // only count correct picks

      const pts = difficultyPoints(p.difficulty);
      const cur = pointsByEntry.get(p.entry_id) ?? 0;
      pointsByEntry.set(p.entry_id, cur + pts);
    }

    console.log(
      "[resolve_day] entries with points:",
      pointsByEntry.size,
    );

    // 3) Write totals back to entries.points_total.
    //    This is idempotent: we always SET to the computed total, not increment.
    for (const [entryId, totalPts] of pointsByEntry.entries()) {
      const { error: updErr } = await sb
        .from("entries")
        .update({ points_total: totalPts })
        .eq("id", entryId);

      if (updErr) {
        console.error(
          "[resolve_day] failed to update entry",
          entryId,
          updErr,
        );
      }
    }

    // 4) Optional: ensure entries with no correct picks yet stay at 0
    // (they already default to 0, so nothing required here).

    // 5) Return a simple summary to the caller / cron
    const summary = {
      target_day: TARGET_DAY,
      entries_scored: pointsByEntry.size,
    };

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resolve_day] unexpected error", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 },
    );
  }
});
