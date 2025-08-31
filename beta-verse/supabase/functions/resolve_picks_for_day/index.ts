import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

function etOffsetDate(n: number) {
  const tz = "America/New_York";
  const d = new Date(Date.now() + n * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}-${p.find(x=>x.type==='day')!.value}`;
}

serve(async () => {
  const y = etOffsetDate(-1); // yesterday ET
  await sb.rpc("grade_picks_for_date", { p_date: y });
  await sb.rpc("eliminate_losers_for_date", { p_date: y });
  await sb.rpc("finalize_tournaments");
  return new Response(JSON.stringify({ ok: true, date: y }));
});
