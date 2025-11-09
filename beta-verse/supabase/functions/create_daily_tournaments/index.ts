// supabase/functions/create_daily_tournaments/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/**
 * Env required:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - FN_SECRET   (simple shared secret to call this function)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fn-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

/** YYYY-MM-DD in America/New_York */
function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Build a UTC ISO from an ET wall clock + offset minutes (-240 DST, -300 standard) */
function etToUtcIso(local: string, tzOffsetMin: number): string {
  // parse "YYYY-MM-DDTHH:mm:ss"
  const [d, t = "00:00:00"] = local.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map((x) => Number(x));

  const utcMs = Date.UTC(y, m - 1, dd, hh, mm, ss);
  return new Date(utcMs + tzOffsetMin * -60 * 1000).toISOString();
}

/** Midnight ET (00:00) to UTC ISO for a given YYYY-MM-DD and offset */
function midnightEtUtcIso(day: string, tzOffsetMin: number): string {
  return etToUtcIso(`${day}T00:00:00`, tzOffsetMin);
}

/** Map fee -> (tier, title) */
function tierForFee(fee: number): { tier: string; title: string } {
  if (fee === 20) return { tier: "mars", title: "Mars — $20" };
  if (fee === 50) return { tier: "jupiter", title: "Jupiter — $50" };
  if (fee === 100) return { tier: "saturn", title: "Saturn — $100" };
  return { tier: "custom", title: `Tournament — $${fee}` };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  // simple shared secret (keeps this endpoint private)
  const secret = req.headers.get("x-fn-secret") ?? "";
  if (!secret || secret !== FN_SECRET) {
    return json({ ok: false, message: "Invalid x-fn-secret" }, 401);
  }

  // ----- Parse body (all optional with sensible defaults) -----
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  const entryFees: number[] = (body.entry_fees ?? [20, 50, 100]).map((n: any) =>
    Number(n)
  );

  const dayDate: string = body.day_date ?? todayET(); // "YYYY-MM-DD" ET
  const firstLocal: string | null = body.first_game_at_local ?? null; // "YYYY-MM-DDTHH:mm:ss" ET
  const tzOffsetMin: number = Number.isFinite(body.tz_offset_min)
    ? body.tz_offset_min
    : -240; // -240 DST, -300 standard
  const weekLabel: string | null = body.week_label ?? null;

  // ----- Compute join window -----
  const start_date = dayDate;
  const end_date = dayDate;

  const join_open_at = midnightEtUtcIso(dayDate, tzOffsetMin);

  const first_game_utc = firstLocal
    ? etToUtcIso(firstLocal, tzOffsetMin)
    : null;

  // default close: 23:59 ET on day_date
  const endOfDayUtc = etToUtcIso(`${dayDate}T23:59:00`, tzOffsetMin);

  const join_close_at = first_game_utc
    ? new Date(
        new Date(first_game_utc).getTime() - 30 * 60 * 1000,
      ).toISOString()
    : endOfDayUtc;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // ----- Build rows for upsert -----
  const rows = entryFees.map((fee) => {
    const { tier, title } = tierForFee(fee);
    return {
      title,
      tier, // used in onConflict
      entry_fee_cents: Math.round(fee * 100),
      start_date,
      end_date,
      join_open_at,
      join_close_at,
      settled_at: null,
      ...(weekLabel ? { week_label: weekLabel } : {}),
    };
  });

  // Upsert keyed by (start_date, tier)
  const { data, error } = await admin
    .from("tournaments")
    .upsert(rows, {
      onConflict: "start_date,tier",
    })
    .select(
      "id, title, tier, entry_fee_cents, start_date, join_open_at, join_close_at",
    );

  if (error) {
    return json({ ok: false, message: error.message }, 400);
  }

  return json({
    ok: true,
    created_or_updated: data?.length ?? 0,
    day_date: dayDate,
    tournaments: data,
  });
});
