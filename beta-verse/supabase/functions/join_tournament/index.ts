// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * ENV you must set:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS (adjust origin if you want to lock it down)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed" }, 405);
    }

    const auth = req.headers.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) return json({ ok: false, message: "Missing Bearer token" }, 401);

    const accessToken = match[1];

    // Admin client (service role) so we can verify the user & bypass RLS safely.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // Verify the JWT belongs to a real user
    const { data: userResp, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userResp?.user) {
      return json({ ok: false, message: "Invalid token" }, 401);
    }
    const userId = userResp.user.id;

    // Read body
    const body = await req.json().catch(() => ({} as any));
    const tournamentId = Number(body?.tournament_id ?? body?.tournamentId ?? body?.id);
    if (!Number.isFinite(tournamentId)) {
      return json({ ok: false, message: "tournament_id required" }, 400);
    }

    // Load and lock the tournament row for checks
    const { data: tRes, error: tErr } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tRes) return json({ ok: false, message: "Tournament not found" }, 404);

    // Business rules: must be open + within join window
    const status = String(tRes.status || "").toLowerCase();
    const now = new Date().getTime();
    const openAt = tRes.join_open_at ? new Date(tRes.join_open_at).getTime() : null;
    const closeAt = tRes.join_close_at ? new Date(tRes.join_close_at).getTime() : null;

    const windowOpen =
      (openAt === null || now >= openAt) && (closeAt === null || now < closeAt);

    if (status !== "open" || !windowOpen) {
      return json({ ok: false, message: "Join window closed" }, 409);
    }

    // Already joined?
    const { data: exists } = await admin
      .from("entries")
      .select("id")
      .eq("user_id", userId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (exists?.id) {
      return json({ ok: true, alreadyJoined: true }, 200);
    }

    // Insert (conflict safe thanks to unique index)
    const { error: insErr } = await admin
      .from("entries")
      .insert({ user_id: userId, tournament_id: tournamentId });

    if (insErr) {
      // Unique violation or something else
      const isUnique =
        (insErr as any)?.code === "23505" ||
        /duplicate key|unique/i.test(String(insErr?.message || ""));
      if (isUnique) {
        return json({ ok: true, alreadyJoined: true }, 200);
      }
      throw insErr;
    }

    return json({ ok: true }, 200);
  } catch (err: any) {
    console.error("join_tournament error:", err);
    return json({ ok: false, message: "Server error" }, 500);
  }
}, { onListen: () => {} });

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
}
