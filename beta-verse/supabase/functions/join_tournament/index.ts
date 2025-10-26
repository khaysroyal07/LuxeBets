// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  // MUST include the user's access token from the app
  const bearer = req.headers.get("authorization") ?? "";
  const m = bearer.match(/^Bearer\s+(.+)$/i);
  if (!m) return json({ ok: false, message: "Missing Bearer token" }, 401);
  const userJwt = m[1];

  // Create a client that ALWAYS uses the service-role key to PostgREST
  // (apikey + Authorization both set to service role)
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, message: "Missing SUPABASE_URL or SERVICE_ROLE" }, 500);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    global: {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    },
  });

  // Verify the user token (uses GoTrue; not affected by RLS)
  const { data: u, error: uErr } = await admin.auth.getUser(userJwt);
  if (uErr || !u?.user) return json({ ok: false, message: "Invalid token" }, 401);
  const userId = u.user.id;

  // Get tournament id from JSON or query
  let body: any = {};
  try { body = await req.json(); } catch {}
  const url = new URL(req.url);
  const tid = String(body?.tournament_id ?? body?.id ?? url.searchParams.get("tournament_id") ?? "");
  if (!tid) return json({ ok: false, message: "tournament_id required" }, 400);

  // DEBUG PROBE: ask PostgREST which role it thinks we are.
  // (requires a tiny SQL function you can add once:
  //   create or replace function public.pg_role() returns text language sql stable as $$ select current_role::text $$;)
  // If you don't have it, this call will just be skipped.
  let role: string | undefined;
  try {
    const probe = await admin.rpc("pg_role");
    if (!probe.error) role = probe.data as string | undefined;
  } catch {}

  // Load the tournament (this is where RLS would block if anon key is used)
  const tRes = await admin
    .from("tournaments")
    .select("*")
    .eq("id", tid)
    .maybeSingle();

  if (tRes.error) {
    return json({
      ok: false,
      message: `load tournament: ${tRes.error.message}`,
      role,                                // <— see which role hit PostgREST
      diagnostic: "If role !== service_role, your function is not using the service key.",
    }, 400);
  }
  const t = tRes.data;
  if (!t) return json({ ok: false, message: "Tournament not found", role }, 404);

  // Join window check
  const now = Date.now();
  const openAt  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : null;
  const closeAt = t.join_close_at ? new Date(t.join_close_at).getTime() : null;
  const windowOpen = (openAt == null || now >= openAt) && (closeAt == null || now < closeAt);
  if (!windowOpen) return json({ ok: false, message: "Join window closed", role }, 409);

  // Already joined?
  const found = await admin
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("tournament_id", tid)
    .maybeSingle();
  if (found.error) return json({ ok: false, message: `find: ${found.error.message}`, role }, 400);
  if (found.data?.id) return json({ ok: true, alreadyJoined: true, role });

  // Insert (unique constraint guards dupes)
  const ins = await admin.from("entries").insert({ user_id: userId, tournament_id: tid });
  if (ins.error) {
    const isUnique = ins.error.code === "23505" || /duplicate key|unique/i.test(ins.error.message || "");
    if (isUnique) return json({ ok: true, alreadyJoined: true, role });
    return json({ ok: false, message: `insert: ${ins.error.message}`, role }, 400);
  }

  return json({ ok: true, role });
});
