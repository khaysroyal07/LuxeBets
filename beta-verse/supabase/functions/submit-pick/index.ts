import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const body = await req.json();
    const { tournament_entry_id, game_id, prediction } = body;

    const { data, error } = await supabase.from("game_picks").insert([
      {
        tournament_entry_id,
        game_id,
        prediction,
        result: null, // to be resolved later
      },
    ]);

    if (error) throw error;

    return new Response(JSON.stringify({ submitted: true, pick: data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
