// supabase/functions/resolve_results/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type SportCode = "nba" | "nfl" | "mlb" | "nhl" | "wnba";
type Market = "ml" | "spread" | "total";
type Side = "home" | "away" | "over" | "under";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTIONS_SECRET") || Deno.env.get("FN_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ACTIVE_SPORTS: SportCode[] = (Deno.env.get("SPORTS_ACTIVE") || "nba,nfl")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s): s is SportCode =>
    s === "nba" || s === "nfl" || s === "mlb" || s === "nhl" || s === "wnba"
  );

function authOrNull(req: Request): Response | null {
  if (!FUNCTION_SECRET) return null;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== FUNCTION_SECRET) return new Response("Unauthorized", { status: 401 });
  return null;
}

const TZ = "America/New_York";
function toDayISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getYesterdayISO_ET(): string {
  const now = new Date();
  const nowET = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  nowET.setDate(nowET.getDate() - 1);
  nowET.setHours(0, 0, 0, 0);
  return toDayISO(nowET);
}

function readMarket(p: any): Market {
  const col = String(p.market ?? "").toLowerCase();
  if (col === "spread") return "spread";
  if (col === "total") return "total";
  return "ml";
}

function readSide(p: any): Side | null {
  const sel = p.selection || {};
  const s = String(sel.side ?? "").toLowerCase();
  return s === "home" || s === "away" || s === "over" || s === "under" ? s : null;
}

function toNumOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function readLine(p: any): number | null {
  const sel = p.selection || {};
  return (
    toNumOrNull(sel.line) ??
    toNumOrNull(sel.spread) ??
    toNumOrNull(sel.handicap) ??
    toNumOrNull(sel.points) ??
    toNumOrNull(sel.total) ??
    toNumOrNull(sel.value) ??
    toNumOrNull(sel.number) ??
    null
  );
}

type Grade = { result: "win" | "loss" | "push"; is_correct: boolean | null; points: number };

function gradePick(
  market: Market,
  side: Side,
  line: number | null,
  home: number,
  away: number,
): Grade | null {
  const total = home + away;
  const WIN_PTS = 10;
  const PUSH_PTS = 5;
  const LOSS_PTS = 0;

  if (market === "ml") {
    if (home === away) return { result: "push", is_correct: null, points: PUSH_PTS };
    const winSide = home > away ? "home" : "away";
    const won = side === winSide;
    return { result: won ? "win" : "loss", is_correct: won, points: won ? WIN_PTS : LOSS_PTS };
  }

  if (market === "spread") {
    if (line == null) return null;
    if (side !== "home" && side !== "away") return null;

    if (side === "home") {
      const adj = home + line;
      if (adj === away) return { result: "push", is_correct: null, points: PUSH_PTS };
      const won = adj > away;
      return { result: won ? "win" : "loss", is_correct: won, points: won ? WIN_PTS : LOSS_PTS };
    } else {
      const adj = away + line;
      if (adj === home) return { result: "push", is_correct: null, points: PUSH_PTS };
      const won = adj > home;
      return { result: won ? "win" : "loss", is_correct: won, points: won ? WIN_PTS : LOSS_PTS };
    }
  }

  if (market === "total") {
    if (line == null) return null;
    if (side !== "over" && side !== "under") return null;

    if (total === line) return { result: "push", is_correct: null, points: PUSH_PTS };

    if (side === "over") {
      const won = total > line;
      return { result: won ? "win" : "loss", is_correct: won, points: won ? WIN_PTS : LOSS_PTS };
    } else {
      const won = total < line;
      return { result: won ? "win" : "loss", is_correct: won, points: won ? WIN_PTS : LOSS_PTS };
    }
  }

  return null;
}

function isNumericId(s: string) {
  return /^\d+$/.test(s);
}

// Your NFL pick keys look like: "CAR-LAR-2026-01-10T16:30:00"
// That should match games.game_key (we’ll backfill it in SQL)
function pickGameKey(p: any): string | null {
  const fromColumn = String(p.game_key ?? "").trim();
  if (fromColumn) return fromColumn;

  const lg = String(p.league_game_id ?? "").trim();
  if (!lg) return null;
  if (isNumericId(lg)) return null; // numeric should match league_game_id map

  // treat it as a key already
  return lg;
}

async function fetchGamesWithScores(startISO: string, endISO: string, sports: SportCode[]) {
  const { data, error } = await sb
    .from("games")
    .select("id, sport, league_game_id, game_key, game_day, home_score, away_score")
    .gte("game_day", startISO)
    .lte("game_day", endISO)
    .in("sport", sports)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (error) throw error;

  const byLeagueId = new Map<string, any>();
  const byGameKey = new Map<string, any>();

  for (const g of (data ?? []) as any[]) {
    const sport = String(g.sport);
    const lgid = String(g.league_game_id ?? "").trim();
    const gk = String(g.game_key ?? "").trim();

    if (lgid) byLeagueId.set(`${sport}::${lgid}`, g);
    if (gk) byGameKey.set(`${sport}::${gk}`, g);
  }

  return { games: data ?? [], byLeagueId, byGameKey };
}

async function fetchUngradedPicksRange(startISO: string, endISO: string, sports: SportCode[]) {
  const q = await sb
    .from("picks")
    .select("id, sport, league_game_id, game_key, market, selection, game_day, day_date")
    .in("sport", sports)
    .is("graded_at", null)
    .or(
      [
        `game_day.gte.${startISO},game_day.lte.${endISO}`,
        `day_date.gte.${startISO},day_date.lte.${endISO}`,
      ].join(","),
    );

  if (q.error) throw q.error;
  return q.data ?? [];
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function gradeRange(startISO: string, endISO: string, sports: SportCode[]) {
  const { games, byLeagueId, byGameKey } = await fetchGamesWithScores(startISO, endISO, sports);
  const picks = await fetchUngradedPicksRange(startISO, endISO, sports);

  let picksUpdated = 0;
  let skippedNoMatchingGame = 0;
  let skippedMissingLine = 0;
  let skippedBadSide = 0;
  let matchedByLeagueId = 0;
  let matchedByGameKey = 0;

  const nowISO = new Date().toISOString();
  const updates: any[] = [];

  for (const p of picks as any[]) {
    const sport = String(p.sport);
    const lgid = String(p.league_game_id ?? "").trim();

    let g: any | null = null;

    if (lgid && isNumericId(lgid)) {
      g = byLeagueId.get(`${sport}::${lgid}`) ?? null;
      if (g) matchedByLeagueId++;
    }

    if (!g) {
      const gk = pickGameKey(p);
      if (gk) {
        g = byGameKey.get(`${sport}::${gk}`) ?? null;
        if (g) matchedByGameKey++;
      }
    }

    if (!g) {
      skippedNoMatchingGame++;
      continue;
    }

    const home = Number(g.home_score);
    const away = Number(g.away_score);
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      skippedNoMatchingGame++;
      continue;
    }

    const market = readMarket(p);
    const side = readSide(p);
    if (!side) {
      skippedBadSide++;
      continue;
    }

    const line = readLine(p);
    if ((market === "spread" || market === "total") && line == null) {
      skippedMissingLine++;
      continue;
    }

    const graded = gradePick(market, side, line, home, away);
    if (!graded) continue;

    updates.push({
      id: p.id,
      result: graded.result,
      is_correct: graded.is_correct,
      points: graded.points,
      graded_at: nowISO,
      resolved_at: nowISO,
    });
  }

  for (const batch of chunk(updates, 200)) {
    const { error } = await sb.from("picks").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    picksUpdated += batch.length;
  }

  return {
    startISO,
    endISO,
    sports,
    gamesWithScores: games.length,
    picksFound: picks.length,
    picksToUpdate: updates.length,
    picksUpdated,
    matchedByLeagueId,
    matchedByGameKey,
    skippedNoMatchingGame,
    skippedMissingLine,
    skippedBadSide,
  };
}

serve(async (req) => {
  const auth = authOrNull(req);
  if (auth) return auth;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const dayISO = typeof body?.dayISO === "string" ? body.dayISO.slice(0, 10) : undefined;
    let startISO = typeof body?.startISO === "string" ? body.startISO.slice(0, 10) : undefined;
    let endISO = typeof body?.endISO === "string" ? body.endISO.slice(0, 10) : undefined;

    if (dayISO) { startISO = dayISO; endISO = dayISO; }
    if (!startISO || !endISO) { startISO = getYesterdayISO_ET(); endISO = startISO; }

    const s = String(body?.sport ?? "").toLowerCase().trim();
    const sports: SportCode[] =
      s === "nba" || s === "nfl" || s === "mlb" || s === "nhl" || s === "wnba"
        ? [s]
        : ACTIVE_SPORTS;

    const result = await gradeRange(startISO, endISO, sports);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[resolve_results] error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
