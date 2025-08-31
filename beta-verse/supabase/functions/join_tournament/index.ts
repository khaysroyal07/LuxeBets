// supabase/functions/join_tournament/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Supabase client acting AS THE USER (RLS enforced)
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });

  try {
    const { tournament_id } = await req.json().catch(() => ({}));
    if (!tournament_id) {
      return new Response(JSON.stringify({ error: "tournament_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Identify user
    const { data: userData, error: uErr } = await sb.auth.getUser();
    if (uErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Load tournament + ensure join window open (defense-in-depth; RLS also enforces)
    const { data: tRow, error: tErr } = await sb
      .from("tournaments")
      .select("id, status, join_close_at, end_at")
      .eq("id", tournament_id)
      .single();

    if (tErr || !tRow) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const lockAt = new Date(tRow.join_close_at ?? tRow.end_at).getTime();
    if (tRow.status !== "open" || !(lockAt > now)) {
      return new Response(JSON.stringify({ error: "Tournament is locked" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Insert entrant (unique constraint prevents duplicates)
    const { error: iErr } = await sb
      .from("entrants")
      .insert({ tournament_id, user_id: userId, status: "ALIVE" });
    if (iErr) {
      // If duplicate, surface a friendly message
      const msg = (iErr as any)?.message || "";
      if (/duplicate key value|unique constraint/i.test(msg)) {
        return new Response(JSON.stringify({ ok: true, alreadyJoined: true }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: msg || "Failed to join" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // TODO: payment capture / wallet debit (left as a separate flow)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
