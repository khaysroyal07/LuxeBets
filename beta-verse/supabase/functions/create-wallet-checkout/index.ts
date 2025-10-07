import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SQUARE_API_BASE = "https://connect.squareup.com/v2";

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN") || "";
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SQUARE_VERSION = Deno.env.get("SQUARE_VERSION") ?? "2025-09-24";

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  // ENV sanity
  const missing: string[] = [];
  if (!SQUARE_ACCESS_TOKEN) missing.push("SQUARE_ACCESS_TOKEN");
  if (!SQUARE_LOCATION_ID) missing.push("SQUARE_LOCATION_ID");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) return json(500, { error: "Missing env", missing });

  try {
    const { userId, amount_cents } = await req.json();
    if (!userId || !Number.isInteger(amount_cents) || amount_cents < 100) {
      return json(400, { error: "Invalid payload", got: { userId, amount_cents } });
    }

    // make sure wallet row exists
    await sbAdmin.rpc("ensure_wallet_for_user", { p_user_id: userId });

    const idempotencyKey = crypto.randomUUID();
    const redirect_url = `${SUPABASE_URL}/functions/v1/square-redirect`; // HTTPS shim

    const body = {
      idempotency_key: idempotencyKey,
      location_id: SQUARE_LOCATION_ID,
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: [
          {
            name: "Wallet Deposit",
            quantity: "1",
            base_price_money: { amount: amount_cents, currency: "USD" },
          },
        ],
      },
      redirect_url,
    };

    const res = await fetch(`${SQUARE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const sq = await res.json();
    if (!res.ok) {
      // Surface Square’s exact error back to the app
      return json(500, { error: "Square error", status: res.status, square: sq });
    }

    const checkoutUrl = sq?.checkout_page_url || sq?.checkout?.checkout_page_url;
    const extRef: string = sq?.order_id ?? sq?.order?.id ?? sq?.id ?? idempotencyKey;

    // Create pending ledger row
    const { error: ledErr } = await sbAdmin.from("wallet_ledger").insert({
      user_id: userId,
      type: "deposit",
      amount_cents,
      status: "pending",
      ext_ref: extRef,
    });
    if (ledErr) {
      // not fatal for the flow, but tell the client
      return json(500, { error: "DB insert ledger failed", details: ledErr });
    }

    return json(200, { checkoutUrl, extRef });
  } catch (e) {
    console.error("create-wallet-checkout error:", e);
    return json(500, { error: "Unhandled exception", detail: String(e) });
  }
}
