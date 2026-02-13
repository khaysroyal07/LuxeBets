// supabase/functions/create_daily_tournaments/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: old header secret (x-fn-secret)
const FN_SECRET = Deno.env.get("FN_SECRET") ?? "";

// Optional: bearer secret (Authorization: Bearer <token>)
const FUNCTIONS_SECRET = Deno.env.get("FUNCTIONS_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fn-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
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

/**
 * DST-safe ET offset minutes using Intl ("shortOffset")
 * returns -300 (EST) or -240 (EDT) typically
 */
function currentEtOffsetMin(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(new Date());

  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return -240; // fallback
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] ?? 0);
  const mm = Number(m[3] ?? 0);
  return sign * (hh * 60 + mm);
}

/** Add N days to YYYY-MM-DD (calendar math) -> YYYY-MM-DD */
function addDaysEt(d: string, days: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const js = new Date(y, m - 1, dd + days);
  const yy = js.getFullYear();
  const mm = String(js.getMonth() + 1).padStart(2, "0");
  const ddd = String(js.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
}

/** Convert ET wall clock "YYYY-MM-DDTHH:mm:ss" -> UTC ISO using offset minutes */
function etToUtcIso(local: string, tzOffsetMin: number): string {
  const [d, t = "00:00:00"] = local.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map((x) => Number(x));
  const utcMs = Date.UTC(y, m - 1, dd, hh, mm, ss);
  // UTC = local - offset
  return new Date(utcMs - tzOffsetMin * 60 * 1000).toISOString();
}

function tierForFee(fee: number): { tier: string; title: string } {
  if (fee === 10) return { tier: "mercury", title: "Mercury — $10" };
  if (fee === 20) return { tier: "mars", title: "Mars — $20" };
  if (fee === 50) return { tier: "jupiter", title: "Jupiter — $50" };
  if (fee === 100) return { tier: "saturn", title: "Saturn — $100" };
  return { tier: "custom", title: `Tournament — $${fee}` };
}

/**
 * ✅ Option B Auth:
 * Allow either:
 *  - x-fn-secret header equals FN_SECRET
 *  - Authorization: Bearer <token> equals FUNCTIONS_SECRET
 */
function isAuthorized(req: Request): { ok: boolean; why?: string } {
  // If neither secret is configured, we allow (useful for local testing).
  if (!FN_SECRET && !FUNCTIONS_SECRET) return { ok: true };

  const xSecret = (req.headers.get("x-fn-secret") ?? "").trim();
  if (FN_SECRET && xSecret && xSecret === FN_SECRET) return { ok: true };

  const bearer = (req.headers.get("Authorization") ?? "")
    .replace("Bearer ", "")
    .trim();
  if (FUNCTIONS_SECRET && bearer && bearer === FUNCTIONS_SECRET) return { ok: true };

  return { ok: false, why: "Missing/invalid secret (x-fn-secret or Authorization bearer)" };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  // ✅ Auth check (Option B)
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return json({ ok: false, message: "Unauthorized", detail: auth.why }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  // default includes Mercury now
  const entryFees: number[] = (body.entry_fees ?? [10, 20, 50, 100]).map(
    (n: any) => Number(n)
  );

  // expected Sunday of that week (ET)
  const sundayDate: string = body.day_date ?? todayET();

  // DST-safe offset unless overridden
  const tzOffsetMin: number = Number.isFinite(body.tz_offset_min)
    ? Number(body.tz_offset_min)
    : currentEtOffsetMin();

  const weekLabel: string | null = body.week_label ?? null;

  // Business logic:
  // - Join opens Sunday 00:00 ET
  // - Join closes Tuesday (first game time - N minutes)
  // - Tournament runs Tuesday -> Sunday (6 days)
  const tuesdayDate = addDaysEt(sundayDate, 2);
  const tournamentStartDate = tuesdayDate; // Tuesday
  const tournamentEndDate = addDaysEt(tuesdayDate, 5); // Sunday

  const join_open_at = etToUtcIso(`${sundayDate}T00:00:00`, tzOffsetMin);

  // default first game time (can override from cron call)
  const tuesdayFirstGameTimeET: string =
    body.tuesday_first_game_time_et ?? "19:00:00"; // 7pm ET default

  const lockMinutesBefore: number = Number.isFinite(
    body.lock_minutes_before_first_game
  )
    ? Number(body.lock_minutes_before_first_game)
    : 30;

  const firstGameUtcIso = etToUtcIso(
    `${tuesdayDate}T${tuesdayFirstGameTimeET}`,
    tzOffsetMin
  );
  const firstGameUtc = new Date(firstGameUtcIso);

  const joinCloseUtc = new Date(
    firstGameUtc.getTime() - lockMinutesBefore * 60 * 1000
  );
  const join_close_at = joinCloseUtc.toISOString();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const rows = entryFees.map((fee) => {
    const { tier, title } = tierForFee(fee);
    return {
      title,
      tier,
      entry_fee_cents: Math.round(fee * 100),
      start_date: tournamentStartDate,
      end_date: tournamentEndDate,
      join_open_at,
      join_close_at,
      settled_at: null,
      ...(weekLabel ? { week_label: weekLabel } : {}),
    };
  });

  // Upsert keyed by (start_date, tier)
  const { data, error } = await admin
    .from("tournaments")
    .upsert(rows, { onConflict: "start_date,tier" })
    .select(
      "id, title, tier, entry_fee_cents, start_date, end_date, join_open_at, join_close_at"
    );

  if (error) return json({ ok: false, message: error.message }, 400);

  return json({
    ok: true,
    created_or_updated: data?.length ?? 0,
    input_sunday: sundayDate,
    computed: {
      tz_offset_min: tzOffsetMin,
      join_open_at,
      join_close_at,
      tournament_start_date: tournamentStartDate,
      tournament_end_date: tournamentEndDate,
      tuesday_first_game_time_et: tuesdayFirstGameTimeET,
      lock_minutes_before_first_game: lockMinutesBefore,
    },
    tournaments: data,
  });
});
