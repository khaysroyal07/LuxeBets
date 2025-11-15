// supabase/functions/update_leaderboards/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

serve(async () => {
  try {
    const { error } = await sb.rpc("refresh_leaderboards");
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("update_leaderboards error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
