// supabase/functions/square-payment-updated/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: true, info: "non-POST ignored" });
  }

  try {
    const raw = await req.text();
    console.log("Square webhook raw:", raw);

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid JSON from Square:", e);
      return json({ ok: true, error: "invalid_json" });
    }

    const eventType: string =
      payload?.type ?? payload?.event_type ?? "unknown";
    console.log("Square webhook event:", eventType);

    // We only care about payment events
    if (!String(eventType).toLowerCase().includes("payment")) {
      return json({ ok: true, ignored: eventType });
    }

    const payment = payload?.data?.object?.payment;
    if (!payment) {
      console.error("Missing payment object:", payload);
      return json({ ok: true, error: "no_payment" });
    }

    const status: string = payment.status ?? "";
    console.log("Payment status:", status);

    // Accept sandbox statuses APPROVED and COMPLETED
    if (!["APPROVED", "COMPLETED"].includes(status.toUpperCase())) {
      return json({ ok: true, ignored_status: status });
    }

    const orderId: string | undefined = payment.order_id;
    const paymentId: string | undefined = payment.id;

    if (!orderId) {
      console.error("Missing order_id on payment:", payment);
      return json({ ok: true, error: "no_order_id" });
    }

    // 1) Find pending deposit row
    const { data: deposit, error: depErr } = await sb
      .from("wallet_deposits")
      .select("*")
      .eq("provider", "square")
      .eq("provider_ref", orderId)
      .eq("status", "pending")
      .maybeSingle();

    if (depErr) {
      console.error("Deposit lookup error:", depErr);
      return json({ ok: true, error: "deposit_lookup_failed" });
    }

    if (!deposit) {
      console.error("No pending deposit for orderId", orderId);
      return json({ ok: true, error: "deposit_not_found", orderId });
    }

    // 2) Credit wallet via RPC
    const { error: walletErr } = await sb.rpc("wallet_apply_ledger", {
      p_user_id: deposit.user_id,
      p_type: "deposit",
      p_amount_cents: deposit.amount_cents,
      p_status: "succeeded",
      p_ext_ref: paymentId ?? orderId,
    });

    if (walletErr) {
      console.error("wallet_apply_ledger error:", walletErr);
      return json({ ok: true, error: "wallet_apply_failed" });
    }

    // 3) Mark deposit as succeeded
    const { error: updErr } = await sb
      .from("wallet_deposits")
      .update({ status: "succeeded" })
      .eq("id", deposit.id);

    if (updErr) {
      console.error("Deposit status update error:", updErr);
      return json({ ok: true, error: "deposit_update_failed" });
    }

    console.log("Deposit completed for user", deposit.user_id);
    return json({ ok: true });
  } catch (e: any) {
    console.error("Unhandled error in Square webhook:", e);
    return json({ ok: true, error: "unhandled", details: String(e) });
  }
});
