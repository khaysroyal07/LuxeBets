// supabase/functions/join_tournament/index.ts
// deno deploy
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { tournament_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, message: "not signed in" }), { status: 401 });
    }

    // 1) try plain INSERT
    const { data, error } = await supabase
      .from("entries")                            // <— insert into the **base table**
      .insert({ user_id: user.id, tournament_id }) // no upsert, no on conflict
      .select("id")
      .single();

    if (error) {
      // 2) treat duplicate as already joined
      if ((error as any).code === "23505") {
        const { data: row } = await supabase
          .from("entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("tournament_id", tournament_id)
          .maybeSingle();
        return new Response(
          JSON.stringify({ ok: true, alreadyJoined: true, entry_id: row?.id }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      // pass other errors through
      return new Response(
        JSON.stringify({ ok: false, message: error.message, code: (error as any).code }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, entry_id: data.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 400 });
  }
});
