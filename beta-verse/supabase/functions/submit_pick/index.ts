// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const j = (o: any, s = 200) =>
  new Response(typeof o === "string" ? o : JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return j({ ok: false, code: "AUTH_MISSING", message: "Missing Authorization header" }, 401);
    }

    const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });

    // caller
    const { data: g, error: gErr } = await sb.auth.getUser();
    if (gErr) return j({ ok: false, code: "AUTH_ERROR", message: gErr.message }, 401);
    const user = g.user;
    if (!user) return j({ ok: false, code: "NOT_SIGNED_IN" }, 401);

    // input
    const body = await req.json().catch(() => ({}));
    const tournament_id = Number(body?.tournament_id);
    const day_date = String(body?.day_date || "").slice(0, 10); // YYYY-MM-DD
    const game_id = String(body?.game_id || "");
    const selection = String(body?.selection || "").toLowerCase();

    if (!Number.isFinite(tournament_id)) return j({ ok: false, code: "BAD_REQUEST", message: "tournament_id required" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day_date)) return j({ ok: false, code: "BAD_REQUEST", message: "day_date must be YYYY-MM-DD" }, 400);
    if (!game_id) return j({ ok: false, code: "BAD_REQUEST", message: "game_id required" }, 400);
    if (!["home", "away"].includes(selection)) return j({ ok: false, code: "BAD_REQUEST", message: "selection must be 'home' or 'away'" }, 400);

    // already picked?
    const { data: existing } = await sb
      .from("picks")
      .select("id")
      .eq("tournament_id", tournament_id)
      .eq("user_id", user.id)
      .eq("day_date", day_date)
      .maybeSingle();

    if (existing) {
      return j({ ok: false, code: "ALREADY_PICKED", message: "You already made a pick for this day." }, 200);
    }

    // insert (immutable)
    const { data: ins, error: insErr } = await sb
      .from("picks")
      .insert({ tournament_id, user_id: user.id, day_date, game_id, selection })
      .select("id,tournament_id,user_id,day_date,game_id,selection,created_at")
      .maybeSingle();

    if (insErr) return j({ ok: false, code: "DB_ERROR", message: insErr.message }, 200);

    return j({ ok: true, pick: ins }, 200);
  } catch (e) {
    return j({ ok: false, code: "UNHANDLED", message: String(e?.message || e) }, 500);
  }
});
