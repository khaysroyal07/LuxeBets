// supabase/functions/join_tournament/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  // ---- auth from client ----
  const bearer = req.headers.get("authorization") ?? "";
  const m = bearer.match(/^Bearer\s+(.+)$/i);
  if (!m) return json({ ok: false, message: "Missing Bearer token" }, 401);
  const userJwt = m[1];

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(
      { ok: false, message: "Missing SUPABASE_URL or SERVICE_ROLE" },
      500,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    global: {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    },
  });

  // verify token
  const { data: u, error: uErr } = await admin.auth.getUser(userJwt);
  if (uErr || !u?.user) {
    return json({ ok: false, message: "Invalid token" }, 401);
  }
  const userId = u.user.id;

  // ---- body params ----
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const url = new URL(req.url);
  const tid = String(
    body?.tournament_id ??
      body?.id ??
      url.searchParams.get("tournament_id") ??
      "",
  );
  if (!tid) {
    return json({ ok: false, message: "tournament_id required" }, 400);
  }

  const referralCodeRaw = (body?.referral_code ?? "").toString().trim();
  const hasReferral = referralCodeRaw.length > 0;

  // ---- load tournament ----
  const tRes = await admin
    .from("tournaments")
    .select("*")
    .eq("id", tid)
    .maybeSingle();

  if (tRes.error) {
    return json(
      { ok: false, message: `load tournament: ${tRes.error.message}` },
      400,
    );
  }
  const t: any = tRes.data;
  if (!t) return json({ ok: false, message: "Tournament not found" }, 404);

  const nowMs = Date.now();
  const openAt = t.join_open_at ? new Date(t.join_open_at).getTime() : null;
  const closeAt = t.join_close_at ? new Date(t.join_close_at).getTime() : null;
  const windowOpen =
    (openAt == null || nowMs >= openAt) && (closeAt == null || nowMs < closeAt);

  if (!windowOpen || t.status !== "open") {
    return json({ ok: false, message: "Join window closed" }, 409);
  }

  // ---- already joined? ----
  const found = await admin
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("tournament_id", tid)
    .maybeSingle();

  if (found.error) {
    return json(
      { ok: false, message: `find: ${found.error.message}` },
      400,
    );
  }
  if (found.data?.id) {
    return json({
      ok: true,
      alreadyJoined: true,
      entry_id: found.data.id,
    });
  }

  // ---- determine base entry fee (cents) ----
  let baseFeeCents: number | null = null;

  // 1) main source of truth: entry_fee_cents (int)
  if (
    typeof t.entry_fee_cents === "number" &&
    Number.isFinite(t.entry_fee_cents) &&
    t.entry_fee_cents > 0
  ) {
    baseFeeCents = t.entry_fee_cents;
  }

  // 2) fallback: entry_fee numeric (dollars)
  if (
    baseFeeCents == null &&
    typeof t.entry_fee === "number" &&
    Number.isFinite(t.entry_fee) &&
    t.entry_fee > 0
  ) {
    baseFeeCents = Math.round(t.entry_fee * 100);
  }

  // 3) fallback: tier
  if (baseFeeCents == null && typeof t.tier === "string") {
    const tier = String(t.tier).toLowerCase();
    if (tier === "mars") baseFeeCents = 2000; // $20
    else if (tier === "jupiter") baseFeeCents = 5000; // $50
    else if (tier === "saturn") baseFeeCents = 10000; // $100
  }

  // 4) extra fallback: planet_name
  if (baseFeeCents == null && typeof t.planet_name === "string") {
    const planet = String(t.planet_name).toLowerCase();
    if (planet === "mars") baseFeeCents = 2000;
    else if (planet === "jupiter") baseFeeCents = 5000;
    else if (planet === "saturn") baseFeeCents = 10000;
  }

  if (baseFeeCents == null || baseFeeCents <= 0) {
    return json(
      { ok: false, message: "Tournament is misconfigured (no entry fee)" },
      500,
    );
  }

  // ---- optional referral lookup ----
  let referral: any = null;
  let discountCents = 0;

  if (hasReferral) {
    const { data: ref, error: refErr } = await admin
      .from("referral_codes")
      .select("*")
      .ilike("code", referralCodeRaw) // case-insensitive
      .eq("is_active", true)
      .maybeSingle();

    if (refErr) {
      return json(
        {
          ok: false,
          message: "Referral lookup failed",
          details: refErr.message,
        },
        400,
      );
    }

    if (!ref) {
      return json(
        {
          ok: false,
          message: "Referral code is invalid or inactive",
          code_error: "not_found",
        },
        400,
      );
    }

    // tournament restriction (if set)
    if (
      ref.applies_to_tournament_id &&
      ref.applies_to_tournament_id !== tid
    ) {
      return json(
        {
          ok: false,
          message: "Referral code cannot be used for this tournament",
          code_error: "wrong_tournament",
        },
        400,
      );
    }

    // expiry
    if (ref.expire_at) {
      const expMs = new Date(ref.expire_at).getTime();
      if (!isNaN(expMs) && expMs <= nowMs) {
        return json(
          {
            ok: false,
            message: "Referral code has expired",
            code_error: "expired",
          },
          400,
        );
      }
    }

    // max uses
    if (
      ref.max_uses !== null &&
      ref.max_uses !== undefined &&
      ref.max_uses > 0 &&
      ref.used_count >= ref.max_uses
    ) {
      return json(
        {
          ok: false,
          message: "Referral code usage limit reached",
          code_error: "max_uses",
        },
        400,
      );
    }

    // NEW USER ONLY check
    if (ref.new_user_only === true) {
      const { data: priorEntry, error: priorErr } = await admin
        .from("entries")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (priorErr) {
        return json(
          {
            ok: false,
            message: "Failed to check new-user eligibility",
            details: priorErr.message,
          },
          400,
        );
      }

      if (priorEntry?.id) {
        return json(
          {
            ok: false,
            message: "This referral code is only for new users.",
            code_error: "not_new_user",
          },
          400,
        );
      }
    }

    referral = ref;
    if (
      typeof ref.discount_cents === "number" &&
      ref.discount_cents > 0
    ) {
      discountCents = ref.discount_cents;
    }
  }

  // cap discount to fee
  if (discountCents < 0) discountCents = 0;
  if (discountCents > baseFeeCents) discountCents = baseFeeCents;

  const effectiveCostCents = baseFeeCents - discountCents;

  // ---- wallet check (must have enough for effective cost) ----
  if (effectiveCostCents > 0) {
    const { data: acct, error: acctErr } = await admin
      .from("wallet_accounts")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle();

    if (acctErr) {
      return json(
        { ok: false, message: `wallet: ${acctErr.message}` },
        400,
      );
    }

    const balance = acct?.balance_cents ?? 0;
    if (balance < effectiveCostCents) {
      return json(
        {
          ok: false,
          message: "Insufficient wallet balance",
          code_error: "insufficient_funds",
          required_cents: effectiveCostCents,
          balance_cents: balance,
        },
        402,
      );
    }
  }

  // ---- create entry ----
  const ins = await admin
    .from("entries")
    .insert({
      user_id: userId,
      tournament_id: tid,
    })
    .select("id")
    .maybeSingle();

  if (ins.error) {
    const isUnique =
      ins.error.code === "23505" ||
      /duplicate key|unique/i.test(ins.error.message || "");
    if (isUnique) {
      return json({ ok: true, alreadyJoined: true });
    }
    return json(
      { ok: false, message: `insert: ${ins.error.message}` },
      400,
    );
  }

  const entryId = ins.data?.id;

  // ---- debit wallet & ledger ----
  if (effectiveCostCents > 0 && entryId) {
    const { error: debitErr } =
      await admin.rpc("wallet_debit_for_tournament_entry", {
        p_user_id: userId,
        p_amount_cents: effectiveCostCents,
        p_referral_code: referral ? referral.code : null,
        p_referral_discount_cents: discountCents,
      });

    if (debitErr) {
      console.error(
        "wallet_debit_for_tournament_entry error",
        debitErr,
      );
      return json(
        {
          ok: false,
          message:
            "Entry created but wallet debit failed. Contact support.",
        },
        500,
      );
    }
  }

  // ---- record referral usage & bump used_count ----
  if (referral && entryId) {
    const usageIns = await admin.from("referral_usages").insert({
      code_id: referral.id,
      user_id: userId,
      tournament_id: tid,
      entry_id: entryId,
    });
    if (usageIns.error) {
      console.error(
        "referral_usages insert error",
        usageIns.error,
      );
    }

    const newUsed = (referral.used_count ?? 0) + 1;
    const shouldDeactivate =
      referral.max_uses !== null &&
      referral.max_uses !== undefined &&
      referral.max_uses > 0 &&
      newUsed >= referral.max_uses;

    const upd = await admin
      .from("referral_codes")
      .update({
        used_count: newUsed,
        ...(shouldDeactivate ? { is_active: false } : {}),
      })
      .eq("id", referral.id);

    if (upd.error) {
      console.error(
        "referral_codes update error",
        upd.error,
      );
    }
  }

  return json({
    ok: true,
    entry_id: entryId,
    base_fee_cents: baseFeeCents,
    discount_cents: discountCents,
    charged_cents: effectiveCostCents,
    referral_code: referral ? referral.code : null,
  });
});
