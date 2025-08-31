// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SPORT_CFG: Record<string, { base:string; gamesByDate:string }> = {
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  gamesByDate: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", gamesByDate: "GamesByDate" },
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  gamesByDate: "GamesByDate" },
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  gamesByDate: "ScoresByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  gamesByDate: "GamesByDate" },
};

const TIERS = [
  { tier: "20",  name: "Tournament of Mars"   },
  { tier: "50",  name: "Tournament of Jupiter"},
  { tier: "100", name: "Tournament of Saturn" },
];
console.log("DBG SUPABASE_URL =", Deno.env.get("SUPABASE_URL"));

function toSDIODate(d: Date) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const y = d.getFullYear();
  const m = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

async function sdioByDate(sport: string, date: Date) {
  const cfg = SPORT_CFG[sport];
  const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(toSDIODate(date))}?key=${encodeURIComponent(SDIO_KEY)}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function firstGameBetween(sport: string, start: Date, end: Date): Promise<Date | null> {
  const all: number[] = [];
  const d = new Date(start);
  while (d <= end) {
    const arr = await sdioByDate(sport, d);
    for (const g of arr) {
      const raw = g.DateTime || g.Day;
      const dt = raw ? new Date(raw) : null;
      if (dt && !Number.isNaN(dt.getTime())) all.push(dt.getTime());
    }
    d.setDate(d.getDate()+1);
  }
  if (!all.length) return null;
  return new Date(Math.min(...all));
}

// Compute Tue→Thu (based on current week)
function tuesdayToThursday(): { tue: Date; thu: Date } {
  const now = new Date();
  const dow = now.getDay();              // 0 Sun..6 Sat
  const tue = new Date(now); tue.setHours(0,0,0,0);
  // move to this week's Tuesday (or next if already past Tue? we want the current week's Tue)
  const delta = ((2 - dow) + 7) % 7;     // days until Tue
  tue.setDate(tue.getDate() + (dow <= 2 ? (2-dow) : (9-dow))); // “next Tue” if past Tue; good for cron at Tue 00:05

  const thu = new Date(tue); thu.setDate(thu.getDate()+2); thu.setHours(23,59,59,999);
  return { tue, thu };
}

function isoWeekYear(d: Date) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week: weekNo };
}

serve(async () => {
  try {
    const { tue, thu } = tuesdayToThursday();
    const { year, week } = isoWeekYear(tue);

    const upserts: any[] = [];
    for (const sport of Object.keys(SPORT_CFG)) {
      const first = await firstGameBetween(sport, tue, thu);
      const closeAt = new Date(first ? first.getTime() - 30*60*1000 : (thu.getTime() - 30*60*1000));
      const openAt = new Date(tue); openAt.setHours(0,5,0,0);

      for (const t of TIERS) {
        // idempotent check
        const { data: already, error } = await supabase
          .from("tournaments").select("id")
          .eq("cycle_year", year).eq("cycle_week", week)
          .eq("sport", sport).eq("tier", t.tier).maybeSingle();

        if (!already) {
          const ins = {
            tier: t.tier,
            name: t.name,
            cycle_week: week,
            cycle_year: year,
            sport,
            open_at: openAt.toISOString(),
            close_at: closeAt.toISOString(),
            window_start: tue.toISOString().slice(0,10),
            window_end: thu.toISOString().slice(0,10),
            status: "open",
          };
          const { error: insErr } = await supabase.from("tournaments").insert(ins);
          if (insErr) console.error("insert err", insErr.message, ins);
          else upserts.push(ins);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, created: upserts.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
