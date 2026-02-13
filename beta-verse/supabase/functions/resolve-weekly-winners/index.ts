// supabase/functions/weekly-payouts/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function authOrNull(req: Request): Response | null {
  if (!FUNCTION_SECRET) return null;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) return new Response("Unauthorized", { status: 401 });
  return null;
}

serve(async (req) => {
  const auth = authOrNull(req);
  if (auth) return auth;

  try {
    const nowISO = new Date().toISOString();

    // Assumes tournaments has: id, end_iso, status, payout_run_at, entry_fee_cents
    const { data: tournaments, error: tErr } = await supabase
      .from("tournaments")
      .select("id, end_iso, status, payout_run_at, entry_fee_cents")
      .lte("end_iso", nowISO)
      .eq("status", "resolved")
      .is("payout_run_at", null);

    if (tErr) throw tErr;

    if (!tournaments?.length) {
      return new Response(JSON.stringify({ ok: true, message: "No tournaments to payout" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payoutSummary: any[] = [];

    for (const t of tournaments as any[]) {
      const tournamentId = String(t.id);
      const feeCents = Number(t.entry_fee_cents ?? 0);

      // winners
      const { data: winners, error: wErr } = await supabase
        .from("entries")
        .select("id, user_id")
        .eq("tournament_id", tournamentId)
        .eq("status", "winner");

      if (wErr) {
        console.error("winners fetch error", tournamentId, wErr);
        continue;
      }

      // total entries count for pool
      const { count: entryCount, error: cErr } = await supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);

      if (cErr) {
        console.error("entry count error", tournamentId, cErr);
        continue;
      }

      const totalPoolCents = Math.max(0, (entryCount ?? 0) * feeCents);

      // If no winners, still close tournament payout_run_at to avoid loops
      if (!winners?.length || totalPoolCents <= 0) {
        await supabase
          .from("tournaments")
          .update({ status: "paid_out", payout_run_at: nowISO })
          .eq("id", tournamentId);

        payoutSummary.push({
          tournamentId,
          winners: winners?.length ?? 0,
          entryCount: entryCount ?? 0,
          totalPoolCents,
          perWinnerCents: 0,
        });
        continue;
      }

      const perWinnerCents = Math.floor(totalPoolCents / winners.length);
      if (perWinnerCents <= 0) {
        await supabase
          .from("tournaments")
          .update({ status: "paid_out", payout_run_at: nowISO })
          .eq("id", tournamentId);

        payoutSummary.push({
          tournamentId,
          winners: winners.length,
          entryCount: entryCount ?? 0,
          totalPoolCents,
          perWinnerCents: 0,
        });
        continue;
      }

      // wallet ledger inserts
      const ledgerRows = winners.map((w: any) => ({
        user_id: w.user_id,
        type: "payout",
        amount_cents: perWinnerCents,
        ext_ref: `tournament:${tournamentId}`,
        status: "succeeded",
      }));

      const { error: lErr } = await supabase.from("wallet_ledger").insert(ledgerRows);
      if (lErr) {
        console.error("ledger insert error", tournamentId, lErr);
        continue;
      }

      // mark tournament paid
      const { error: upErr } = await supabase
        .from("tournaments")
        .update({ status: "paid_out", payout_run_at: nowISO })
        .eq("id", tournamentId);

      if (upErr) {
        console.error("tournament update error", tournamentId, upErr);
      }

      payoutSummary.push({
        tournamentId,
        winners: winners.length,
        entryCount: entryCount ?? 0,
        totalPoolCents,
        perWinnerCents,
      });

      // optional email
      if (resend) {
        for (const w of winners as any[]) {
          try {
            const { data: userRes } = await supabase.auth.admin.getUserById(w.user_id);
            const email = userRes?.user?.email;
            if (!email) continue;

            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", w.user_id)
              .maybeSingle();

            const displayName = profile?.full_name || profile?.username || "Player";

            await resend.emails.send({
              from: "LuxeBETS <no-reply@yourdomain.com>",
              to: email,
              subject: "You won this week's tournament! 🎉",
              html: `
                <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px;">
                  <h2>Congratulations, ${displayName}! 🎉</h2>
                  <p>We credited <strong>$${(perWinnerCents / 100).toFixed(2)}</strong> to your wallet.</p>
                  <p>Open the app to see your updated balance.</p>
                </div>
              `,
            });
          } catch (e) {
            console.error("email error", e);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, payoutSummary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("weekly-payouts error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
