// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;                 // auto-provided in cloud
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;               // auto-provided in cloud
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // you'll set this secret

    // 1) Verify the caller (user) using anon client + Bearer token
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing or invalid Authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Not authenticated" }, 401);

    // 2) Body
    const { tournament_id } = await req.json().catch(() => ({}));
    if (!tournament_id) return json({ error: "tournament_id required" }, 400);

    // 3) Use service client to bypass RLS for the insert (safer than client-side insert)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY);

    // 4) Verify tournament is open & not past close_at
    const { data: t, error: tErr } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournament_id)
      .maybeSingle();
    if (tErr) return json({ error: tErr.message }, 500);
    if (!t) return json({ error: "Tournament not found" }, 404);
    if (t.status !== "open") return json({ error: "Tournament not open" }, 423);
    if (Date.now() >= new Date(t.close_at).getTime()) return json({ error: "Tournament locked" }, 423);

    // 5) Prevent duplicates
    const { data: existing, error: xErr } = await admin
      .from("tournament_entries")
      .select("id")
      .eq("tournament_id", tournament_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (xErr) return json({ error: xErr.message }, 500);
    if (existing) return json({ error: "Already joined" }, 409);

    // 6) Insert entry (service client avoids RLS headaches)
    const { error: insErr } = await admin
      .from("tournament_entries")
      .insert({ tournament_id, user_id: user.id, status: "entered" });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({ ok: true, joined: true }, 201);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
