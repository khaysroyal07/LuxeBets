// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const ok = (p: any) =>
  new Response(JSON.stringify(p), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const ms = () => Date.now();
const iso = (d?: number) => new Date(d ?? ms()).toISOString();
const mask = (s: string, head = 12) => (s?.length ? `${s.slice(0, head)}…(${s.length})` : "");

serve(async (req) => {
  const t0 = ms();
  const debug: Record<string, any> = { at: iso(), steps: [] };
  const push = (k: string, v: any) => {
    const row = { k, v, at: iso() };
    debug.steps.push(row);
    // Also print to function logs
    console.log("DBG", k, JSON.stringify(v));
  };

  try {
    const auth = req.headers.get("Authorization") || "";
    push("auth_header_present", { present: auth.startsWith("Bearer "), token: mask(auth.replace("Bearer ", "")) });
    if (!auth.startsWith("Bearer ")) {
      return ok({ ok:false, code:"AUTH_MISSING", message:"Missing Authorization header", debug });
    }

    const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ures, error: uerr } = await sb.auth.getUser();
    push("auth_getUser", { error: uerr?.message, user_id: ures?.user?.id });
    if (uerr) return ok({ ok:false, code:"AUTH_ERROR", message:uerr.message, debug });
    const user = ures?.user;
    if (!user) return ok({ ok:false, code:"NOT_SIGNED_IN", message:"Not signed in", debug });

    const body = await req.json().catch(() => ({}));
    const tournament_id = Number(body?.tournament_id);
    const wantDebug = !!body?.debug;
    push("request_body", { body, parsed_tournament_id: tournament_id });

    if (!Number.isFinite(tournament_id)) {
      return ok({ ok:false, code:"BAD_REQUEST", message:"tournament_id required (number)", debug });
    }

    // Load tournament and compute window
    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id,status,join_open_at,join_close_at")
      .eq("id", tournament_id)
      .maybeSingle();
    push("load_tournament", { error: tErr?.message, t });

    if (tErr) return ok({ ok:false, code:"DB_TOURNAMENT", message:tErr.message, debug });
    if (!t)  return ok({ ok:false, code:"NOT_FOUND", message:"Tournament not found", debug });

    const now = ms();
    const openAt  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : 0;
    const closeAt = t.join_close_at ? new Date(t.join_close_at).getTime() : Number.MAX_SAFE_INTEGER;
    const windowOpen = t.status === "open" && now >= openAt && now < closeAt;
    push("join_window_check", {
      status: t.status,
      now_iso: iso(now),
      open_iso: t.join_open_at,
      close_iso: t.join_close_at,
      openAt_ms: openAt, closeAt_ms: closeAt, windowOpen
    });

    if (!windowOpen) {
      return ok({
        ok:false, code:"JOIN_CLOSED", message:"Join window closed",
        status:t.status, join_open_at:t.join_open_at, join_close_at:t.join_close_at,
        debug
      });
    }

    // Upsert entrant (lowercase status)
    push("upsert_attempt", { tournament_id, user_id: user.id });
    const { data: ins, error: insErr } = await sb
      .from("entrants")
      .upsert({ tournament_id, user_id: user.id, status: "active" }, { onConflict: "tournament_id,user_id" })
      .select("id,tournament_id,user_id,status")
      .maybeSingle();

    if (insErr) {
      console.error("JOIN_FAILED", {
        msg: insErr.message,
        details: (insErr as any).details,
        hint: (insErr as any).hint,
        code: (insErr as any).code
      });
      push("upsert_error", {
        msg: insErr.message,
        details: (insErr as any).details,
        hint: (insErr as any).hint,
        code: (insErr as any).code
      });
      return ok({
        ok:false, code:"JOIN_FAILED", message:insErr.message,
        details:(insErr as any).details, hint:(insErr as any).hint, pgcode:(insErr as any).code,
        debug: wantDebug ? debug : undefined
      });
    }

    push("upsert_success", ins);
    return ok({ ok:true, entrant: ins, took_ms: ms() - t0, debug: wantDebug ? debug : undefined });
  } catch (e) {
    console.error("UNHANDLED", e);
    debug.steps.push({ k:"UNHANDLED", v: String(e?.message || e), at: iso() });
    return ok({ ok:false, code:"UNHANDLED", message:String(e?.message || e), debug });
  }
});
