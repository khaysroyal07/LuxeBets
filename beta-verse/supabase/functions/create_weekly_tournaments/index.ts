// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const TZ = "America/New_York";
const pad = (n: number) => String(n).padStart(2, "0");

function etParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  return {
    y: +p.find(x => x.type === "year")!.value,
    m: +p.find(x => x.type === "month")!.value,
    d: +p.find(x => x.type === "day")!.value,
  };
}

// Compute UTC timestamp for ET start/end of a given calendar day
function etStartOfDayUTC(y: number, m: number, d: number) {
  // use UTC noon to derive the correct ET offset for that date
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const utcStr = noonUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const etStr  = noonUTC.toLocaleString("en-US", { timeZone: TZ });
  const offsetMin = (Date.parse(utcStr) - Date.parse(etStr)) / 60000; // 240 or 300
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
}
function etEndOfDayUTC(y: number, m: number, d: number) {
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const utcStr = noonUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const etStr  = noonUTC.toLocaleString("en-US", { timeZone: TZ });
  const offsetMin = (Date.parse(utcStr) - Date.parse(etStr)) / 60000;
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59) + offsetMin * 60000);
}

function nextTuesdayETRange(now = new Date()) {
  const { y, m, d } = etParts(now);
  const etNow = new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00Z`); // anchor
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: TZ }).format(now);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow);
  const daysUntilTue = (2 - idx + 7) % 7 || 7; // next Tue if today is Tue
  const nextTue = new Date(now.getTime() + daysUntilTue * 86400000);
  const t = etParts(nextTue);

  const start = etStartOfDayUTC(t.y, t.m, t.d);           // Tue 00:00 ET
  const end   = etEndOfDayUTC(t.y, t.m, t.d + 5);         // Sun 23:59:59 ET
  const joinOpen  = start;                                 // Tue 00:00 ET
  const joinClose = etEndOfDayUTC(t.y, t.m, t.d + 2);     // Thu 23:59:59 ET
  return { start, end, joinOpen, joinClose };
}

function weekLabel(d: Date) {
  const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const millis = d.getTime() - onejan.getTime();
  const week = Math.ceil((((millis / 86400000) + onejan.getUTCDay() + 1) / 7));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

serve(async () => {
  const { start, end, joinOpen, joinClose } = nextTuesdayETRange();
  const label = weekLabel(start);
  for (const fee of [20, 50, 100]) {
    await sb.from("tournaments").upsert({
      week_label: label,
      entry_fee: fee,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      join_open_at: joinOpen.toISOString(),
      join_close_at: joinClose.toISOString(),
      status: "UPCOMING",
    }, { onConflict: "week_label,entry_fee" });
  }
  return new Response(JSON.stringify({ ok: true, week_label: label }), {
    headers: { "Content-Type": "application/json" },
  });
});
