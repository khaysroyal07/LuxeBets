// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** ===== Env ===== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") || "";     // optional during trial
const TSD_KEY = Deno.env.get("THESPORTSDB_KEY") || "";       // optional fallback provider
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

/** ===== Config ===== */
type SportKey = "mlb" | "nfl" | "nba" | "nhl" | "wnba";
const SDIO_CFG: Record<SportKey, { base: string; path: string }> = {
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  path: "GamesByDate" },
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  path: "ScoresByDate" },
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  path: "GamesByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  path: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", path: "GamesByDate" },
};

const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIO = (d: Date) => `${d.getFullYear()}-${MON[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;
const toISODate = (d: Date) => d.toISOString().slice(0,10);

function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function startOfDayET(input?: string): Date {
  const base = input ? new Date(`${input}T00:00:00`) : nowET();
  const et = new Date(base.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setHours(0,0,0,0);
  return et;
}
function addDays(d: Date, n: number) { const v = new Date(d); v.setDate(v.getDate() + n); return v; }

/** ===== Providers ===== */

/** Try SportsDataIO; returns future game start times (ms) + probe */
async function sdioTimesForDay(day: Date, sports: SportKey[]) {
  const sdioDate = toSDIO(day);
  const cutoff = nowET().getTime();
  const probe: any[] = [];
  const times: number[] = [];

  for (const sport of sports) {
    const cfg = SDIO_CFG[sport];
    if (!cfg) continue;

    // Try query-param style
    if (SDIO_KEY) {
      try {
        const urlQP = `${cfg.base}/${cfg.path}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
        const r = await fetch(urlQP);
        const status = r.status;
        let count = 0;
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr)) {
            count = arr.length;
            for (const g of arr) {
              const t = new Date(g.DateTime || g.Day).getTime();
              if (!Number.isNaN(t) && t >= cutoff) times.push(t);
            }
          }
        }
        probe.push({ provider: "sdio", style: "qp", sport, date: sdioDate, status, count });
        if (count) continue; // got data, skip header try
      } catch (_) { /* ignore */ }

      // Try header style
      try {
        const url = `${cfg.base}/${cfg.path}/${encodeURIComponent(sdioDate)}`;
        const r = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": SDIO_KEY } });
        const status = r.status;
        let count = 0;
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr)) {
            count = arr.length;
            for (const g of arr) {
              const t = new Date(g.DateTime || g.Day).getTime();
              if (!Number.isNaN(t) && t >= cutoff) times.push(t);
            }
          }
        }
        probe.push({ provider: "sdio", style: "hdr", sport, date: sdioDate, status, count });
      } catch (_) { /* ignore */ }
    } else {
      probe.push({ provider: "sdio", sport, date: sdioDate, status: 0, count: 0, note: "no SDIO key set" });
    }
  }
  return { times, probe };
}

/** Minimal TheSportsDB fallback for upcoming events (future-only) */
async function tsdbTimesForDay(day: Date, sports: SportKey[]) {
  // TheSportsDB organizes by league; we’ll map a couple of popular leagues.
  // You can extend this mapping as needed.
  const LEAGUES: Record<SportKey, string[]> = {
    mlb:  ["MLB"],              // "MLB" is alias; TSDB often uses league IDs; free tier: search endpoints vary
    nfl:  ["NFL"],
    nba:  ["NBA"],
    nhl:  ["NHL"],
    wnba: ["WNBA"],
  };

  const cutoff = nowET().getTime();
  const dayISO = toISODate(day);
  const probe: any[] = [];
  const times: number[] = [];

  // We’ll use a generic “events for day” fallback via search API if key present.
  // Note: Free TSDB has varying coverage; this is best-effort.
  if (!TSD_KEY) {
    probe.push({ provider: "tsdb", date: dayISO, status: 0, count: 0, note: "no TSDB key set" });
    return { times, probe };
  }

  for (const sport of sports) {
    const leagues = LEAGUES[sport] || [];
    for (const name of leagues) {
      try {
        // Example pattern (you may swap to league-id specific endpoint if you have IDs):
        // We’ll try upcoming events by league name search.
        const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(TSD_KEY)}/eventsday.php?d=${encodeURIComponent(dayISO)}&l=${encodeURIComponent(name)}`;
        const r = await fetch(url);
        const status = r.status;
        let count = 0;
        if (r.ok) {
          const js = await r.json();
          const arr = js?.events || js?.event || [];
          if (Array.isArray(arr)) {
            count = arr.length;
            for (const ev of arr) {
              // TSDB times are local/UTC mixed; prefer strTimestamp if provided, fallback to date+time
              const raw = ev?.strTimestamp || (ev?.dateEvent && ev?.strTime ? `${ev.dateEvent} ${ev.strTime}` : ev?.dateEvent);
              const t = raw ? new Date(raw).getTime() : NaN;
              if (!Number.isNaN(t) && t >= cutoff) times.push(t);
            }
          }
        }
        probe.push({ provider: "tsdb", sport, league: name, date: dayISO, status, count });
      } catch (_) {
        probe.push({ provider: "tsdb", sport, league: name, date: dayISO, status: 0, count: 0, error: "fetch error" });
      }
    }
  }
  return { times, probe };
}

/** find first future game time within a search window using SDIO, else TSDB */
async function findNearestFutureGame(start: Date, daysAhead: number, sports: SportKey[]) {
  const order: number[] = [0];
  for (let i = 1; i <= daysAhead; i++) order.push(i);

  const aggregateProbe: any[] = [];
  for (const off of order) {
    const day = addDays(start, off);

    // 1) SDIO primary
    const sdio = await sdioTimesForDay(day, sports);
    aggregateProbe.push(...sdio.probe);
    if (sdio.times.length) {
      const first = new Date(Math.min(...sdio.times));
      return { found: true, date: day, firstGame: first, source: "sdio", probe: aggregateProbe };
    }

    // 2) TSDB fallback
    const tsdb = await tsdbTimesForDay(day, sports);
    aggregateProbe.push(...tsdb.probe);
    if (tsdb.times.length) {
      const first = new Date(Math.min(...tsdb.times));
      return { found: true, date: day, firstGame: first, source: "tsdb", probe: aggregateProbe };
    }
  }

  return { found: false, probe: aggregateProbe as any[] };
}

/** ===== HTTP handler ===== */
serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));

    // body params
    //  - date: "YYYY-MM-DD" (start search day; ET)
    //  - sports: ["mlb","nfl","nba","nhl","wnba"]
    //  - days_ahead: number of days forward to search (default 10)
    //  - force_create: boolean; if true, create even when APIs blocked (default false)
    const start = startOfDayET(body?.date);
    const sports: SportKey[] =
      Array.isArray(body?.sports) && body.sports.length
        ? body.sports.filter((s: string) => s in SDIO_CFG) as SportKey[]
        : (["mlb","nfl","nba"] as SportKey[]); // conservative default for trial

    const daysAhead = Number.isFinite(body?.days_ahead) ? Math.max(0, Math.min(30, body.days_ahead)) : 10;
    const forceCreate = !!body?.force_create;

    // search only forward (future-only)
    const found = await findNearestFutureGame(start, daysAhead, sports);
    console.log("create_daily_tournaments probe", {
      start: toISODate(start),
      sports, daysAhead, found: found.found, rows: found.probe.length, source: (found as any).source
    });

    // If we couldn’t find future games but caller insists, create anyway at 8:00 PM ET on start day
    let scheduledFor = toISODate(start);
    let firstGame = found.found ? found.firstGame! : null;

    if (!firstGame && forceCreate) {
      const eightET = new Date(start.toLocaleString("en-US", { timeZone: "America/New_York" }));
      eightET.setHours(20, 0, 0, 0); // 8:00 PM ET default
      firstGame = eightET;
    }

    if (!firstGame) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "No future games in search window",
        searched_from: toISODate(start),
        sports, days_ahead: daysAhead,
        probe: found.probe
      }), { status: 200 });
    }

    if (found.found) scheduledFor = toISODate(found.date);
    const joinClose = new Date(firstGame.getTime() - 30 * 60 * 1000);

    // upsert 3 tiers
    const created: number[] = [];
    for (const fee of [20, 50, 100]) {
      const { data, error } = await supabase
        .from("tournaments")
        .upsert({
          day_date: scheduledFor,
          entry_fee: fee,
          status: "open",
          start_at: firstGame.toISOString(),
          join_open_at: nowET().toISOString(),
          join_close_at: joinClose.toISOString(),
          week_label: `Week of ${scheduledFor}`,
        }, { onConflict: "day_date,entry_fee" })
        .select("id");

      if (error) throw error;
      if (Array.isArray(data) && data[0]?.id) created.push(data[0].id);
    }

    return new Response(JSON.stringify({
      ok: true,
      created,
      scheduled_for: scheduledFor,
      first_game_iso: firstGame.toISOString(),
      source: found.found ? (found as any).source : "fallback",
      probe: found.probe
    }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
});
