// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIODate = (d: Date) =>
  `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const dateStr: string = body?.date;
    const day = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();

    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id, day_date, status")
      .eq("day_date", day.toISOString().slice(0,10))
      .in("status", ["open","running"]);

    if (!tournaments?.length) {
      return new Response(JSON.stringify({ ok: true, msg: "No tournaments" }), { status: 200 });
    }

    // TODO: fetch SportsDataIO scores and update picks + entrants
    // For demo: just close tournaments
    for (const t of tournaments) {
      await supabase.from("tournaments").update({ status: "settled" }).eq("id", t.id);
    }

    return new Response(JSON.stringify({ ok: true, resolved: tournaments.length }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
