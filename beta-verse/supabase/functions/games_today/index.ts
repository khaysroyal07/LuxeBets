import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON          = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(SUPABASE_URL, ANON);

serve(async () => {
  const tz = "America/New_York";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const dateStr = `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;

  const { data, error } = await sb
    .from("games")
    .select("*")
    .eq("game_date", dateStr)
    .order("start_time");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const { data: cutoff } = await sb.rpc("first_game_cutoff", { p_date: dateStr });
  return new Response(JSON.stringify({ date: dateStr, cutoff, games: data ?? [] }), {
    headers: { "Content-Type": "application/json" },
  });
});
