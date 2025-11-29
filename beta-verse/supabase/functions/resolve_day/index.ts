// supabase/functions/resolve_day/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

function checkAuth(req: Request): Response | null {
  if (!FN_SECRET) return null;
  const hdr = req.headers.get("x-fn-secret") ?? req.headers.get("X-Fn-Secret");
  if (hdr !== FN_SECRET) return new Response("Forbidden", { status: 403 });
  return null;
}

function yesterdayUTCISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

type PickRow = {
  entry_id: string;
  game_day: string | null;
  points: number | null;
};

serve(async (req) => {
  const auth = checkAuth(req);
  if (auth) return auth;

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      day?: string;
    };

    // Include all picks with game_day <= TARGET_DAY
    const TARGET_DAY = body.day ?? yesterdayUTCISO();

    console.log("[resolve_day] running for TARGET_DAY:", TARGET_DAY);

    const { data: picks, error: picksErr } = await sb
      .from("picks")
      .select("entry_id, game_day, points")
      .lte("game_day", TARGET_DAY);

    if (picksErr) {
      console.error("[resolve_day] picksErr", picksErr);
      return new Response(
        JSON.stringify({ error: picksErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const rows = (picks ?? []) as PickRow[];

    const totals = new Map<string, number>();

    for (const p of rows) {
      if (!p.entry_id) continue;
      const pts = Number(p.points ?? 0);
      if (!Number.isFinite(pts)) continue;
      const cur = totals.get(p.entry_id) ?? 0;
      totals.set(p.entry_id, cur + pts);
    }

    console.log("[resolve_day] entries with points:", totals.size);

    for (const [entryId, totalPts] of totals.entries()) {
      const { error: updErr } = await sb
        .from("entries")
        .update({ points_total: totalPts })
        .eq("id", entryId);

      if (updErr) {
        console.error(
          "[resolve_day] failed to update entry",
          entryId,
          updErr,
        );
      }
    }

    const summary = {
      target_day: TARGET_DAY,
      entries_scored: totals.size,
    };

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resolve_day] unexpected error", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
