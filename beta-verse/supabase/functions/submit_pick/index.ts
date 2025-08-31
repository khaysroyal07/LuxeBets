import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON          = Deno.env.get("SUPABASE_ANON_KEY")!;

function etDateString(d: Date) {
  const tz = "America/New_York";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(d);
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}-${p.find(x=>x.type==='day')!.value}`;
}

serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401 });
  }
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth }}});

  const { entrant_id, game_id, selection } = await req.json();
  if (!entrant_id || !game_id || !["HOME","AWAY"].includes(selection)) {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const { data: game } = await sb.from("games").select("*").eq("id", game_id).maybeSingle();
  if (!game) return new Response(JSON.stringify({ error: "game not found" }), { status: 404 });

  const now = new Date();
  const todayET = etDateString(now);

  const { data: cutoff } = await sb.rpc("first_game_cutoff", { p_date: todayET });
  if (cutoff && new Date(cutoff) <= now) return new Response(JSON.stringify({ error: "Daily picks are closed" }), { status: 409 });
  if (new Date(game.start_time) <= now) return new Response(JSON.stringify({ error: "game locked" }), { status: 409 });

  const { data: ent } = await sb.from("entrants").select("id,status,joined_at").eq("id", entrant_id).maybeSingle();
  if (!ent || ent.status !== "ALIVE") return new Response(JSON.stringify({ error: "not alive" }), { status: 409 });

  const { error } = await sb.from("picks").insert({
    entrant_id, game_id, selection,
    pick_date: todayET,
    locked_at: game.start_time,
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  return new Response(JSON.stringify({ ok: true }));
});
