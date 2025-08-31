// supabase/functions/list_tournaments/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON          = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(SUPABASE_URL, ANON);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Primary: aggregated view (needs tournaments read policy, which we set)
    const { data: viewRows, error: vErr } = await sb
      .from("v_tournament_counts")
      .select("*")
      .order("entry_fee");

    if (vErr) {
      // Fallback to raw tournaments if the view errors
      const { data: tRows, error: tErr } = await sb
        .from("tournaments")
        .select("id, week_label, entry_fee, status, start_at, end_at, join_open_at, join_close_at")
        .order("entry_fee");
      if (tErr) throw tErr;
      const rows = (tRows || []).map((t) => ({ ...t, entrants_total: 0, entrants_alive: 0 }));
      return new Response(JSON.stringify({ tournaments: rows, fallback: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // If view is reachable but empty, try raw tournaments once
    if (!viewRows?.length) {
      const { data: tRows, error: tErr } = await sb
        .from("tournaments")
        .select("id, week_label, entry_fee, status, start_at, end_at, join_open_at, join_close_at")
        .order("entry_fee");
      if (tErr) return new Response(JSON.stringify({ tournaments: [] }), { headers: { ...cors, "Content-Type": "application/json" } });
      const rows = (tRows || []).map((t) => ({ ...t, entrants_total: 0, entrants_alive: 0 }));
      return new Response(JSON.stringify({ tournaments: rows }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Normal path
    return new Response(JSON.stringify({ tournaments: viewRows }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
