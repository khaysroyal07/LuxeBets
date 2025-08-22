import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { game_id, actual_winner, tournament_id } = await req.json();

    // 1. Resolve picks
    await supabase.rpc("resolve_game_picks", { gid: game_id, actual_winner });

    // 2. Check survivors
    const { data: survivors } = await supabase
      .from("tournament_entries")
      .select("user_id")
      .eq("tournament_id", tournament_id)
      .eq("is_eliminated", false);
 
    if (survivors && survivors.length <= 1) {
      await supabase.rpc("finalize_tournament", { tid: tournament_id });
    }

    return new Response(JSON.stringify({ resolved: true, survivors: survivors?.length ?? 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
