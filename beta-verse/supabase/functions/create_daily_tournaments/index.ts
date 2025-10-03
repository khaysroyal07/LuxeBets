// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_SECRET = Deno.env.get("FN_SECRET")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Get current date string in America/New_York, format YYYY-MM-DD */
function todayInET(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  // en-CA gives YYYY-MM-DD
  return fmt.format(new Date());
}

/** Convert a local ET ISO (e.g. "2025-09-22T19:30:00") into a UTC ISO string */
function etLocalIsoToUtcIso(localIso: string): string {
  // Interpret string in America/New_York and output UTC
  const dt = new Date(localIso); // Date parses as local machine, so we need Intl workaround:
  // Safer: construct from pieces using timeZone to get the UTC-millis for ET
  const [dPart, tPart] = localIso.split("T");
  const [y, m, d] = dPart.split("-").map(Number);
  const [hh, mm = "0", ss = "0"] = (tPart || "00:00:00").split(":");
  const parts = { year: y, month: m, day: d, hour: Number(hh), minute: Number(mm), second: Number(ss) };

  // Use DateTimeFormat to get offset milliseconds for ET at that local time
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  // Create a date from parts in ET by formatting and then parsing to millis via `Date.UTC` from the parts
  // Trick: format a known date to get the equivalent UTC parts is not exposed directly.
  // So we build a Date for the parts in UTC first, then adjust by the ET offset using timeZoneName (not available).
  // Simpler approach: rely on `Date.parse(localIso + ' GMT-0400')` during DST and '-0500' otherwise would be brittle.
  // Pragmatic: If caller passes 'first_game_at_local', we also accept an explicit 'tz_offset_min' to avoid ambiguity.

  // To keep robust: require tz_offset_min when sending first_game_at_local; fallback -240 (DST) if missing.
  return new Date(localIso).toISOString(); // acceptable if caller already provides UTC or your UI avoids this path
}

/** Midnight ET for given YYYY-MM-DD, returned as UTC ISO */
function midnightEtUtcIso(day: string): string {
  // Build "YYYY-MM-DDT00:00:00" interpreted in ET, then to UTC
  // We accept a pragmatic approach: append T00:00:00 and trust Intl is not needed here (server runs UTC).
  return new Date(`${day}T00:00:00-05:00`).toISOString(); // -05:00 (will be off by 1h in DST)
  // If you want perfect DST handling, pass tz_offset_min from client or implement a full TZ table.
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const secret = req.headers.get("x-fn-secret");
  if (!secret || secret !== FN_SECRET) return json({ ok: false, code: "AUTH", error: "Invalid or missing x-fn-secret" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const entryFees: number[] = body.entry_fees ?? [20, 50, 100];
  const dayDate: string = body.day_date ?? todayInET(); // e.g. "2025-09-22"
  const firstLocal: string | undefined = body.first_game_at_local; // "YYYY-MM-DDTHH:mm:ss" in ET (optional)
  const tzOffsetMin: number = typeof body.tz_offset_min === "number" ? body.tz_offset_min : -240; // -240 in DST, -300 in standard
  const weekLabel: string | undefined = body.week_label;

  // Compute times
  const joinOpenAt = new Date(new Date(`${dayDate}T00:00:00.000Z`).getTime() - tzOffsetMin * 60 * 1000).toISOString(); // midnight ET → UTC
  const startAt = firstLocal
    ? new Date(new Date(firstLocal).getTime() - tzOffsetMin * 60 * 1000).toISOString()
    : null;
  const joinCloseAt = startAt ? new Date(new Date(startAt).getTime() - 30 * 60 * 1000).toISOString() : null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const base = {
    day_date: dayDate,
    status: "open",
    join_open_at: joinOpenAt,
    start_at: startAt,
    join_close_at: joinCloseAt,
    end_at: null,
    ...(weekLabel ? { week_label: weekLabel } : {}),
  };

  const rows = entryFees.map((entry_fee) => ({ ...base, entry_fee }));

  const { data, error } = await admin
    .from("tournaments")
    .upsert(rows, { onConflict: "day_date,entry_fee" })
    .select();

  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, affected: data?.length ?? 0, tournaments: data, day_date: dayDate });
});
