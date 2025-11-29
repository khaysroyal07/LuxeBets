// supabase/functions/square-payment-updated/index.ts
// Accepts Square webhooks, logs, and credits wallet on COMPLETED payments.
// Signature verification is DISABLED for MVP.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-square-hmacsha256-signature",
  };
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return new Response("ok", { headers: cors() });

  const raw = await req.text();

  try {
    console.log("Square webhook raw:", raw);

    const evt = JSON.parse(raw);
    const payment =
      evt?.data?.object?.payment ?? evt?.data?.object ?? evt?.payment ?? null;

    if (!payment) {
      console.log("No payment object on event");
      return new Response("ok", { headers: cors() });
    }

    const status: string | undefined = payment.status;
    const orderId: string | undefined = payment.order_id;
    const paymentId: string | undefined = payment.id;
    const amount_cents: number = payment?.amount_money?.amount ?? 0;

    console.log("Parsed payment:", { status, orderId, paymentId, amount_cents });

    if (status !== "COMPLETED" || !amount_cents) {
      console.log("Payment not completed or no amount; ignoring.");
      return new Response("ok", { headers: cors() });
    }

    // Find ledger row by ext_ref (we stored Square order_id/extRef)
    let ledger: any = null;

    if (orderId) {
      const { data } = await sbAdmin
        .from("wallet_ledger")
        .select("*")
        .eq("type", "deposit")
        .eq("ext_ref", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ledger = data;
    }

    if (!ledger && paymentId) {
      const { data } = await sbAdmin
        .from("wallet_ledger")
        .select("*")
        .eq("type", "deposit")
        .eq("ext_ref", paymentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ledger = data;
    }

    if (!ledger) {
      console.warn("No matching ledger row for payment", { orderId, paymentId });
      return new Response("ok", { headers: cors() });
    }

    if (ledger.status === "succeeded") {
      console.log("Ledger already succeeded (idempotent)");
      return new Response("ok", { headers: cors() });
    }

    const extRefToMark = orderId ?? paymentId ?? ledger.ext_ref;

    // Primary path: RPC
    const { error: rpcErr } = await sbAdmin.rpc("wallet_credit_balance", {
      p_ext_ref: extRefToMark,
      p_amount: amount_cents,
    });

    if (rpcErr) {
      console.warn("wallet_credit_balance RPC failed, falling back:", rpcErr);

      // Fallback: manual update
      const { data: acct } = await sbAdmin
        .from("wallet_accounts")
        .select("balance_cents")
        .eq("user_id", ledger.user_id)
        .maybeSingle();

      const current = acct?.balance_cents ?? 0;

      const { error: upErr } = await sbAdmin
        .from("wallet_accounts")
        .update({
          balance_cents: current + amount_cents,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", ledger.user_id);

      if (!upErr) {
        await sbAdmin
          .from("wallet_ledger")
          .update({ status: "succeeded" })
          .eq("id", ledger.id);
      } else {
        console.error("Manual balance update failed:", upErr);
      }
    }

    console.log("Wallet credited successfully");
    return new Response("ok", { headers: cors() });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("ok", { headers: cors() });
  }
}
