// supabase/functions/resolve_day/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const toDayISO = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const dayISO: string = body?.date ? toDayISO(body.date) : toDayISO(new Date());

    // active tournaments (any status except archived/cancelled/settled)
    const { data: tours, error: tErr } = await sb
      .from("tournaments")
      .select("id")
      .eq("day_date", dayISO)
      .not("status", "in", "('archived','cancelled','settled')");
    if (tErr) throw tErr;

    const tIds = (tours ?? []).map((t: any) => t.id);
    if (!tIds.length) {
      return new Response(JSON.stringify({ ok: true, msg: "no active tournaments", dayISO }), { status: 200 });
    }

    // losers for that day (already graded by sync_results)
    const { data: losers, error: lErr } = await sb
      .from("picks")
      .select("id, entry_id, tournament_id")
      .in("tournament_id", tIds)
      .eq("day_date", dayISO)
      .eq("result", "loss");
    if (lErr) throw lErr;

    if (!losers?.length) {
      return new Response(JSON.stringify({ ok: true, eliminated_added: 0, dayISO }), { status: 200 });
    }

    // skip already eliminated for the day
    const { data: existing, error: exErr } = await sb
      .from("eliminations")
      .select("entry_id, tournament_id")
      .eq("day_date", dayISO)
      .in("entry_id", losers.map((p) => p.entry_id));
    if (exErr) throw exErr;

    const already = new Set((existing ?? []).map((x: any) => `${x.entry_id}:${x.tournament_id}`));
    const toInsert = losers
      .filter((p) => !already.has(`${p.entry_id}:${p.tournament_id}`))
      .map((p) => ({
        entry_id: p.entry_id,
        tournament_id: p.tournament_id,
        day_date: dayISO,
        reason: "lost",
      }));

    if (toInsert.length) {
      const { error: insErr } = await sb.from("eliminations").insert(toInsert);
      if (insErr) throw insErr;
    }

    // (Optional) keep entries.status mirrored for UI
    const losingEntryIds = toInsert.map((r) => r.entry_id);
    if (losingEntryIds.length) {
      const { error: eUpdErr } = await sb.from("entries").update({ status: "eliminated" }).in("id", losingEntryIds);
      if (eUpdErr) throw eUpdErr;
    }

    // 🚫 no tournament status updates here
    return new Response(JSON.stringify({ ok: true, eliminated_added: toInsert.length, dayISO }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
