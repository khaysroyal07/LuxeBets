// supabase/functions/sync_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") || ""; // REQUIRED
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

/* ---------- utils ---------- */
const toDayISO = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
// SDIO wants YYYY-MMM-DD (e.g., 2025-OCT-20)
const MONTHS_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const toSDIODate = (dayISO: string) => {
  const d = new Date(dayISO);
  return `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/* ---------- SportsDataIO helpers ---------- */
/**
 * We’ll support these leagues directly via SportsDataIO.
 */
type League = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";

const SPORT_PATH: Record<League, string> = {
  NFL: "nfl",
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  WNBA: "wnba",
};

/**
 * Try a couple endpoints; return first non-empty.
 */
async function fetchSDIOLeague(league: League, dayISO: string) {
  if (!SDIO_KEY) return [];
  const base = `https://api.sportsdata.io/v3/${SPORT_PATH[league]}/scores/json`;
  const d = encodeURIComponent(toSDIODate(dayISO));

  const candidates = [
    `${base}/ScoresByDate/${d}?key=${SDIO_KEY}`,
    `${base}/GamesByDate/${d}?key=${SDIO_KEY}`,
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
        return arr;
      }
    } catch {
      // try next
    }
  }
  return [];
}

/** Normalize SDIO record to { id, done, winner } */
function parseSDIOOutcome(g: any) {
  const id = String(
    g?.GameID ?? g?.GameKey ?? `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`,
  );
  const status = String(g?.Status || g?.GameStatus || "").toLowerCase();
  const done =
    status.includes("final") ||
    status.startsWith("f/") ||
    status.includes("complete") ||
    status === "ended";

  const hs =
    g?.HomeTeamScore ??
    g?.HomeScore ??
    g?.HomeTeamRuns ??
    g?.HomeTeamGoals ??
    g?.HomeTeamPoints ??
    null;
  const as =
    g?.AwayTeamScore ??
    g?.AwayScore ??
    g?.AwayTeamRuns ??
    g?.AwayTeamGoals ??
    g?.AwayTeamPoints ??
    null;

  let winner: "home" | "away" | null = null;
  if (done && hs != null && as != null) {
    winner = hs > as ? "home" : as > hs ? "away" : null; // null => push/tie
  }
  return { id, done, winner };
}

/** Build an index of all { game_id: { done, winner } } for a day across all leagues */
async function buildOutcomeIndex(dayISO: string) {
  const idx: Record<string, { done: boolean; winner: "home" | "away" | null }> =
    {};
  const leagues: League[] = ["NFL", "NBA", "MLB", "NHL", "WNBA"];

  for (const L of leagues) {
    const arr = await fetchSDIOLeague(L, dayISO);
    for (const g of arr) {
      const { id, done, winner } = parseSDIOOutcome(g);
      if (id) idx[id] = { done, winner };
    }
  }
  return idx;
}

/* ---------- Main ---------- */
serve(async (req) => {
  try {
    // optional body: { date?: string, tournament_id?: uuid }
    const body = (await req.json().catch(() => ({}))) as {
      date?: string;
      tournament_id?: string;
    };

    const dayISO: string = body?.date
      ? toDayISO(body.date)
      : toDayISO(new Date());

    // If a specific tournament_id is passed, only grade that.
    // Otherwise, grade all tournaments with that day_date.
    let tournamentsQuery = sb
      .from("tournaments")
      .select("id, day_date")
      .eq("day_date", dayISO);

    if (body.tournament_id) {
      tournamentsQuery = tournamentsQuery.eq("id", body.tournament_id);
    }

    const { data: tours, error: tErr } = await tournamentsQuery;
    if (tErr) throw tErr;

    if (!tours?.length) {
      console.log("sync_results: no tournaments for day, skipping.", dayISO);
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "NO_TOURNAMENTS_FOR_DAY",
          dayISO,
        }),
        { status: 200 },
      );
    }

    const tIds = tours.map((t) => t.id);

    // all PENDING picks for those tournaments/day
    const { data: picks, error: pErr } = await sb
      .from("picks")
      .select("id, entry_id, tournament_id, day_date, game_id, selection, result")
      .in("tournament_id", tIds)
      .eq("day_date", dayISO)
      .eq("result", "pending");
    if (pErr) throw pErr;

    if (!picks?.length) {
      console.log("sync_results: no pending picks for day.", dayISO);
      return new Response(
        JSON.stringify({
          ok: true,
          graded: 0,
          dayISO,
        }),
        { status: 200 },
      );
    }

    // SDIO → outcome index
    const index = await buildOutcomeIndex(dayISO);

    const updates: any[] = [];

    for (const p of picks) {
      const oc = index[String(p.game_id)];
      if (!oc || !oc.done) continue; // still pending or unknown game id

      if (oc.winner === null) {
        // push
        updates.push({ id: p.id, result: "push" });
        continue;
      }

      const won = oc.winner === p.selection; // p.selection must be "home" | "away"
      updates.push({ id: p.id, result: won ? "win" : "loss" });
    }

    if (updates.length) {
      const { error: upErr } = await sb.from("picks").upsert(updates);
      if (upErr) throw upErr;
    }

    // ❌ OLD: insert into eliminations + mark entries eliminated
    // ✅ NEW: elimination is handled by points system in resolve_day – we only grade picks here.

    return new Response(
      JSON.stringify({
        ok: true,
        graded: updates.length,
        dayISO,
      }),
      { status: 200 },
    );
  } catch (e) {
    console.error("sync_results error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
