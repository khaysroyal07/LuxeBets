import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const body = await req.json();
    const { user_id, tournament_id } = body;

    // Check if already joined
    const { data: existing } = await supabase
      .from("tournament_entries")
      .select("*")
      .eq("tournament_id", tournament_id)
      .eq("user_id", user_id)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ message: "Already joined" }), { status: 400 });
    }

    // Add entry
    const { data, error } = await supabase.from("tournament_entries").insert([
      {
        user_id,
        tournament_id,
        is_eliminated: false,
        correct_picks: 0,
      },
    ]);

    if (error) throw error;

    // Increase prize pool
    await supabase.rpc("increment_prize_pool", { tid: tournament_id });

    return new Response(JSON.stringify({ joined: true, entry: data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
