// supabase/functions/get-streaks/index.ts
// Deno + supabase-js v2
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service role allows reading across users; RLS still applies to tables if enabled
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  global: { headers: { "x-rpc-source": "get-streaks" } },
});

type Profile = { id: string; full_name: string | null; username: string | null; avatar_url: string | null; email?: string };
type Pick = { user_id: string; is_correct: boolean; decided_at: string };

serve(async (req) => {
  // Optional: support ?limit=100
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "100")));

  try {
    // Pull recent decided picks (tune window if needed)
    const { data: picks, error: pErr } = await supabase
      .from("picks")
      .select("user_id,is_correct,decided_at")
      .order("decided_at", { ascending: false });

    if (pErr) throw pErr;

    // Compute streaks in-memory (most recent -> back until first loss)
    const byUser: Record<string, number> = {};
    const seenFirst: Record<string, boolean> = {};

    (picks as Pick[]).forEach((row) => {
      const u = row.user_id;
      if (seenFirst[u]) return; // we already hit their first loss; streak is fixed
      if (row.is_correct) {
        byUser[u] = (byUser[u] ?? 0) + 1;
      } else {
        // first loss encountered; lock the streak (0 if loss is first row)
        byUser[u] = byUser[u] ?? 0;
        seenFirst[u] = true;
      }
    });

    // If a user has only wins and no loss yet, they won't be in seenFirst — that’s fine.

    const userIds = Object.keys(byUser);
    if (userIds.length === 0) {
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    // Join profiles for name & avatar
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id,full_name,username,avatar_url")
      .in("id", userIds);

    if (profErr) throw profErr;

    const nameOf = (p: Profile) => p.full_name || p.username || "Anonymous";
    const avatarOf = (p: Profile) => p.avatar_url || "";

    const rows = (profiles as Profile[])
      .map((p) => ({
        id: p.id,
        name: nameOf(p),
        avatarUrl: avatarOf(p),
        streak: byUser[p.id] ?? 0,
      }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, limit);

    return new Response(JSON.stringify(rows), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("[get-streaks] error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
