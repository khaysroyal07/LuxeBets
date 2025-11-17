// supabase/functions/resolve_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

type Outcome = "win" | "loss" | "push";

/* ---------- auth helper ---------- */
function checkAuth(req: Request): Response | null {
  if (!FN_SECRET) return null; // no secret configured → skip check

  const hdr =
    req.headers.get("x-fn-secret") ?? req.headers.get("X-Fn-Secret");
  if (hdr !== FN_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/**
 * POINTS HELPER
 * --------------
 * Only awards points on a WIN.
 *
 * odds <= -200  -> 1.0 pt   (big favorite)
 * -199..-120    -> 1.5 pts
 * -119..+119    -> 2.0 pts  (coin flip / default)
 * +120..+199    -> 3.0 pts  (medium dog)
 * >= +200       -> 4.0 pts  (big dog)
 */
function pointsForPick(
  americanOdds: number | null,
  outcome: Outcome,
): number {
  if (outcome !== "win") return 0;

  // If odds missing, treat as coin flip (2 pts)
  if (americanOdds == null || Number.isNaN(Number(americanOdds))) {
    return 2.0;
  }

  const odds = Number(americanOdds);

  if (odds <= -200) return 1.0;
  if (odds <= -120) return 1.5;
  if (odds < 120) return 2.0;
  if (odds < 200) return 3.0;
  return 4.0;
}

serve(async (req) => {
  // optional header auth
  const auth = checkAuth(req);
  if (auth) return auth;

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1) Picks that *already* have a final result but no points yet
    const { data: picks, error: pErr } = await sb
      .from("picks")
      .select("id, result, american_odds, points")
      .in("result", ["win", "loss", "push"])
      .is("points", null);
    if (pErr) throw pErr;

    if (!picks || picks.length === 0) {
      return new Response(
        JSON.stringify({
          updated: 0,
          message: "No picks needing point resolution.",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const updates: any[] = [];
    const now = new Date().toISOString();

    for (const p of picks as any[]) {
      const res = String(p.result || "").toLowerCase() as Outcome;
      if (!["win", "loss", "push"].includes(res)) continue;

      const pts = pointsForPick(
        p.american_odds != null ? Number(p.american_odds) : null,
        res,
      );

      updates.push({
        id: p.id,
        points: pts,
        resolved_at: now,
      });
    }

    if (updates.length) {
      const { error: uErr } = await sb.from("picks").upsert(updates);
      if (uErr) throw uErr;
    }

    return new Response(
      JSON.stringify({
        updated: updates.length,
        message: "Points resolved.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("resolve_results error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
