// supabase/functions/wallet_deposit_create/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- ENV ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID")!;
const SQUARE_ENV = Deno.env.get("SQUARE_ENV") || "sandbox"; // "sandbox" | "production"

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const squareBase =
  SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

type ReqBody = {
  userId: string;
  amount_cents: number;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReqBody;
    console.log("wallet_deposit_create body:", body);

    if (!body?.userId) {
      return json({ error: "Missing userId" }, 400);
    }
    if (!Number.isFinite(body.amount_cents) || body.amount_cents < 100) {
      return json(
        { error: "amount_cents must be an integer >= 100" },
        400,
      );
    }

    const { userId, amount_cents } = body;

    // ---------- 1) call Square to create payment link ----------
    const sqResp = await fetch(
      `${squareBase}/v2/online-checkout/payment-links`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "Square-Version": "2023-12-13",
        },
         body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      checkout_options: {
        // Supabase Edge function that will render the confirmation page
        redirect_url: `${SUPABASE_URL}/functions/v1/square_redirect`,
      },
      quick_pay: {
        name: "Wallet deposit",
        price_money: {
          amount: amount_cents,
          currency: "USD",
        },
        location_id: SQUARE_LOCATION_ID,
      },
    }),
      },
    );

    const text = await sqResp.text();
    let sqJson: any = {};
    try {
      sqJson = text ? JSON.parse(text) : {};
    } catch (_e) {
      sqJson = { raw: text };
    }

    if (!sqResp.ok) {
      console.error("Square API error:", sqResp.status, sqJson);
      return json(
        {
          error: "Square API error",
          status: sqResp.status,
          details: sqJson,
        },
        502,
      );
    }

    const checkoutUrl =
      sqJson?.payment_link?.url ||
      sqJson?.checkout?.checkout_page_url ||
      null;

    if (!checkoutUrl) {
      console.error("Square response missing checkoutUrl:", sqJson);
      return json(
        { error: "Square did not return a checkout URL", details: sqJson },
        500,
      );
    }

    const providerRef =
      sqJson?.payment_link?.id ?? sqJson?.checkout?.id ?? null;

    // ---------- 2) insert a pending deposit ----------
    const { data: dep, error: depErr } = await sb
      .from("wallet_deposits")
      .insert({
        user_id: userId,
        amount_cents,
        status: "pending",
        provider: "square",
        provider_ref: providerRef,
        checkout_url: checkoutUrl,
      })
      .select("*")
      .single();

    if (depErr) {
      console.error("Supabase insert error:", depErr);
      return json(
        {
          error: "Failed to create deposit record",
          details: depErr.message,
        },
        500,
      );
    }

    // ---------- 3) return URL to client ----------
    return json(
      {
        checkoutUrl,
        depositId: dep.id,
      },
      200,
    );
  } catch (e: any) {
    console.error("wallet_deposit_create unhandled error:", e);
    return json(
      { error: "Unexpected error", details: String(e?.message ?? e) },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
