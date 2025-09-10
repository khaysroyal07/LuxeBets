// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const weekLabel = (dISO: string) => {
  const d = new Date(dISO);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `Week of ${yyyy}-${mm}-${dd}`;
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // require auth (so only your app can create)
    const u = await sb.auth.getUser();
    if (u.error || !u.data.user) return ok({ ok: false, code: "AUTH" });

    const body = await req.json().catch(() => ({}));
    const day_date: string = body.day_date ?? new Date().toISOString().slice(0, 10);
    const entry_fee: number = Number(body.entry_fee ?? 20);

    // call games_slate to find first kickoff for the date
    let start_at = new Date().toISOString();
    let join_close_at = start_at;
    try {
      const r = await fetch(new URL(req.url).origin + "/functions/v1/games_slate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: req.headers.get("Authorization") ?? "",
        },
        body: JSON.stringify({ sport: "nfl", date: day_date }),
      });
      const js = await r.json();
      const games = (js?.games ?? []).sort(
        (a: any, b: any) => Date.parse(a.kickoff) - Date.parse(b.kickoff),
      );
      if (games.length) {
        start_at = games[0].kickoff;
        join_close_at = new Date(Date.parse(start_at) - 30 * 60 * 1000).toISOString();
      }
    } catch {
      // keep defaults if slate lookup fails
    }

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("tournaments")
      .insert({
        day_date,                // date
        entry_fee,               // integer
        week_label: weekLabel(day_date),
        status: "open",
        start_at,                // timestamptz
        join_open_at: now,       // timestamptz
        join_close_at,           // timestamptz
      })
      .select("id,week_label,day_date,entry_fee,join_open_at,join_close_at,status")
      .maybeSingle();

    if (error) return ok({ ok: false, message: error.message });
    return ok({ ok: true, tournament: data });
  } catch (e) {
    return ok({ ok: false, message: String(e?.message || e) });
  }
});
