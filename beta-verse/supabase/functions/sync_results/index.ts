// supabase/functions/sync_results/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SDIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") || ""; // REQUIRED
const FN_SECRET = Deno.env.get("FN_SECRET") || ""; // optional – set in project if you want header check

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

/* ---------- auth helper ---------- */
function checkAuth(req: Request): Response | null {
  if (!FN_SECRET) return null; // no secret configured → skip check

  const hdr =
    req.headers.get("x-fn-secret") ?? req.headers.get("X-Fn-Secret");
  if (hdr !== FN_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/* ---------- date helpers ---------- */
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
  return `${d.getFullYear()}-${
    MONTHS_ABBR[d.getMonth()]
  }-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------- SportsDataIO helpers ---------- */

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
      // ignore and try next
    }
  }
  return [];
}

/** Normalize SDIO record to { id, done, winner } */
function parseSDIOOutcome(g: any) {
  const id = String(
    g?.GameID ??
      g?.GameId ??
      g?.GameKey ??
      g?.GlobalGameId ??
      `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`,
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
  // optional header auth
  const auth = checkAuth(req);
  if (auth) return auth;

  try {
    if (!SDIO_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "SPORTSDATAIO_KEY missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // optional body: { date?: string }
    const body = (await req.json().catch(() => ({}))) as {
      date?: string;
    };

    const dayISO: string = body?.date
      ? toDayISO(body.date)
      : toDayISO(new Date());

    // 1) Find all pending picks for that day
    const { data: picks, error: pErr } = await sb
      .from("picks")
      .select("id, day_date, league_game_id, game_id, selection, result")
      .eq("day_date", dayISO)
      .in("result", ["pending", "PENDING"]);
    if (pErr) throw pErr;

    if (!picks || picks.length === 0) {
      console.log("sync_results: no pending picks for day", dayISO);
      return new Response(
        JSON.stringify({
          ok: true,
          graded: 0,
          dayISO,
          reason: "NO_PENDING_PICKS",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2) Build SDIO outcome index for that date
    const index = await buildOutcomeIndex(dayISO);

    const updates: any[] = [];

    for (const p of picks as any[]) {
      const gameKey = String(
        p.league_game_id ?? p.game_id ?? "",
      ).trim();
      if (!gameKey) continue;

      const oc = index[gameKey];
      if (!oc || !oc.done) continue; // still pending or unknown game id

      // Decode selection.side from JSON, with legacy fallback
      let side: any = p.selection;
      if (side && typeof side === "object") {
        side = (side as any).side;
      }
      side = typeof side === "string" ? side.toLowerCase() : null;
      if (side !== "home" && side !== "away") continue;

      let result: "win" | "loss" | "push";
      if (oc.winner === null) {
        result = "push";
      } else {
        result = side === oc.winner ? "win" : "loss";
      }

      updates.push({
        id: p.id,
        result,
      });
    }

    if (updates.length) {
      const { error: upErr } = await sb.from("picks").upsert(updates);
      if (upErr) throw upErr;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        graded: updates.length,
        dayISO,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync_results error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
