import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

serve(async () => {
  try {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, day_date, entry_fee, status, start_at, join_open_at, join_close_at, week_label")
      .order("day_date", { ascending: true });

    if (error) throw error;
    return new Response(JSON.stringify({ tournaments: data }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
