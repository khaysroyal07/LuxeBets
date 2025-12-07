// supabase/functions/weekly-payouts/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || null;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

serve(async (req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // 1) Tournaments ready for payout
    const { data: tournaments, error: tErr } = await supabase
      .from("tournaments")
      .select("id, end_iso, status")
      .lte("end_iso", now)
      .eq("status", "resolved")
      .is("payout_run_at", null);

    if (tErr) {
      console.error("Error fetching tournaments:", tErr);
      return new Response("Error fetching tournaments", { status: 500 });
    }

    if (!tournaments || tournaments.length === 0) {
      return new Response("No tournaments to payout", { status: 200 });
    }

    const payoutSummary: any[] = [];

    for (const t of tournaments) {
      const tournamentId = t.id;

      // 2) Winner entries
      const { data: winners, error: wErr } = await supabase
        .from("entries")
        .select("id, user_id")
        .eq("tournament_id", tournamentId)
        .eq("status", "winner");

      if (wErr) {
        console.error("Error fetching winners for tournament", tournamentId, wErr);
        continue;
      }

      if (!winners || winners.length === 0) {
        console.log("No winners for tournament", tournamentId, "- marking paid_out with no payout");
        await supabase
          .from("tournaments")
          .update({
            status: "paid_out",
            payout_run_at: now,
          })
          .eq("id", tournamentId);
        continue;
      }

      // 3) Compute prize pool from all entries (fee_cents)
      const { data: entries, error: eErr } = await supabase
        .from("entries")
        .select("fee_cents")
        .eq("tournament_id", tournamentId);

      if (eErr) {
        console.error("Error fetching entries for tournament", tournamentId, eErr);
        continue;
      }

      const list = entries ?? [];
      const totalPoolCents = list.reduce(
        (sum, e: any) => sum + (e.fee_cents ?? 0),
        0,
      );

      if (totalPoolCents <= 0) {
        console.log("Total pool is 0 for tournament", tournamentId);
        await supabase
          .from("tournaments")
          .update({
            status: "paid_out",
            payout_run_at: now,
          })
          .eq("id", tournamentId);
        continue;
      }

      const numWinners = winners.length;
      const perWinnerCents = Math.floor(totalPoolCents / numWinners);

      if (perWinnerCents <= 0) {
        console.log("Per winner amount is 0 for tournament", tournamentId);
        await supabase
          .from("tournaments")
          .update({
            status: "paid_out",
            payout_run_at: now,
          })
          .eq("id", tournamentId);
        continue;
      }

      // 4) Insert wallet_ledger payouts
      const ledgerRows = winners.map((w) => ({
        user_id: w.user_id,
        type: "payout",
        amount_cents: perWinnerCents,
        ext_ref: `tournament:${tournamentId}`,
        status: "succeeded",
      }));

      const { error: ledgerErr } = await supabase
        .from("wallet_ledger")
        .insert(ledgerRows);

      if (ledgerErr) {
        console.error("Error inserting wallet ledger for tournament", tournamentId, ledgerErr);
        continue;
      }

      // 5) Mark tournament as paid_out
      const { error: updateErr } = await supabase
        .from("tournaments")
        .update({
          status: "paid_out",
          payout_run_at: now,
        })
        .eq("id", tournamentId);

      if (updateErr) {
        console.error("Error marking tournament paid_out", updateErr);
        continue;
      }

      payoutSummary.push({
        tournamentId,
        winners: numWinners,
        totalPoolCents,
        perWinnerCents,
      });

      // 6) Optional: send email to each winner
      if (resend) {
        for (const w of winners) {
          try {
            const { data: userRes, error: userErr } =
              await supabase.auth.admin.getUserById(w.user_id);

            if (userErr || !userRes?.user?.email) {
              console.error("Couldn't fetch user email for", w.user_id, userErr);
              continue;
            }

            const email = userRes.user.email;

            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", w.user_id)
              .maybeSingle();

            const displayName =
              profile?.full_name || profile?.username || "Player";

            await resend.emails.send({
              from: "LuxeBETS <no-reply@yourdomain.com>",
              to: email,
              subject: "You won this week's tournament! 🎉",
              html: `
                <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px;">
                  <h2>Congratulations, ${displayName}! 🎉</h2>
                  <p>You placed <strong>first</strong> in this week's tournament.</p>
                  <p>We just credited <strong>$${(perWinnerCents / 100).toFixed(
                    2,
                  )}</strong> to your LuxeBETS wallet.</p>
                  <p>Open the app to see your updated balance and join the next tournament.</p>
                  <p style="margin-top: 24px; font-size: 12px; color: #666;">
                    This is an automated email. If you have any questions, please contact support.
                  </p>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error("Error sending payout email:", emailErr);
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
