// supabase/functions/resolve_day/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function authOrNull(req: Request): Response | null {
  if (!FUNCTION_SECRET) return null;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) return new Response("Unauthorized", { status: 401 });
  return null;
}

function yesterdayUTCISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  const auth = authOrNull(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => ({})) as { day?: string; dayISO?: string };

    // accept dayISO or day
    const TARGET_DAY = (body?.dayISO || body?.day || yesterdayUTCISO()).slice(0, 10);

    const { data: picks, error: pErr } = await sb
      .from("picks")
      .select("entry_id, points, game_day")
      .lte("game_day", TARGET_DAY);

    if (pErr) throw pErr;

    const totals = new Map<string, number>();
    for (const p of (picks ?? []) as any[]) {
      const entryId = p.entry_id ? String(p.entry_id) : "";
      if (!entryId) continue;
      const pts = Number(p.points ?? 0);
      if (!Number.isFinite(pts)) continue;
      totals.set(entryId, (totals.get(entryId) ?? 0) + pts);
    }

    let updated = 0;
    for (const [entryId, totalPts] of totals.entries()) {
      const { error: uErr } = await sb.from("entries").update({ total_points: totalPts }).eq("id", entryId);
      if (!uErr) updated += 1;
    }

    return new Response(JSON.stringify({ ok: true, target_day: TARGET_DAY, entries_scored: totals.size, entries_updated: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[resolve_day] error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
