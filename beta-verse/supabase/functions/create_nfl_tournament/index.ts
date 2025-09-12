// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toUTC(date: Date) {
  return new Date(date.toISOString());
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  // Simple shared-secret guard (don’t rely on Authorization)
  const secret = req.headers.get("x-fn-secret");
  if (!secret || secret !== FN_SECRET) {
    return json({ ok: false, code: "AUTH", error: "Invalid or missing x-fn-secret" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  // Inputs
  const entryFees: number[] = body.entry_fees ?? [20, 50, 100];
  const tzOffsetMin = body.tz_offset_min ?? -240; // ET default
  const dayStr: string | undefined = body.day_date;        // "YYYY-MM-DD"
  const firstGameISO: string | undefined = body.first_game_at; // local datetime
  const endAtISO: string | undefined = body.end_at;         // optional override
  const status: "open" | "running" | "settled" | "cancelled" = body.status ?? "open";
  const weekLabel: string | undefined = body.week_label ?? undefined;

  // Build dates (treat inputs as local time in tzOffset, convert to UTC)
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffsetMin * 60 * 1000);
  const dayDate = dayStr
    ? new Date(`${dayStr}T00:00:00.000Z`)
    : new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()));

  const firstLocal = firstGameISO ? new Date(firstGameISO) : new Date(localNow.getTime() + 2 * 60 * 60 * 1000);
  const startAt = toUTC(new Date(firstLocal.getTime() - tzOffsetMin * 60 * 1000));
  const joinOpenLocal = new Date(Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate()));
  const joinOpenAt = toUTC(new Date(joinOpenLocal.getTime() - tzOffsetMin * 60 * 1000));
  const joinCloseAt = new Date(startAt.getTime() - 30 * 60 * 1000);

  // end_at: use provided override or leave null (you can also compute duration if you want)
  const endAt = endAtISO ? toUTC(new Date(new Date(endAtISO).getTime() - tzOffsetMin * 60 * 1000)) : null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const base = {
    day_date: dayDate.toISOString().slice(0, 10),
    status,
    start_at: startAt.toISOString(),
    join_open_at: joinOpenAt.toISOString(),
    join_close_at: joinCloseAt.toISOString(),
    end_at: endAt ? endAt.toISOString() : null,
    ...(weekLabel ? { week_label: weekLabel } : {}), // include only if provided
  };

  const rows = entryFees.map((fee) => ({ ...base, entry_fee: fee }));

  // ✅ Idempotent: update on conflict of (day_date, entry_fee)
  const { data, error } = await admin
    .from("tournaments")
    .upsert(rows, { onConflict: "day_date,entry_fee" })
    .select();

  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, affected: data?.length ?? 0, tournaments: data });
});
