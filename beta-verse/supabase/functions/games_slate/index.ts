// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") ?? "";
const SPORTSDB_KEY =
  Deno.env.get("SPORTSDB_KEY") ??
  Deno.env.get("EXPO_PUBLIC_SPORTSDB_KEY") ?? "3";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sport = (url.searchParams.get("sport") ?? body.sport ?? "nfl").toLowerCase();
    const date = url.searchParams.get("date") ?? body.date ?? new Date().toISOString().slice(0, 10);

    let games: any[] = [];
    let upstream = "sportsdataio";

    // Primary: SportsDataIO → ScoresByDate
    if (SPORTSDATAIO_KEY) {
      const endpoint = `https://api.sportsdata.io/v3/${sport}/scores/json/ScoresByDate/${date}`;
      const r = await fetch(`${endpoint}?key=${SPORTSDATAIO_KEY}`, {
        headers: { "Ocp-Apim-Subscription-Key": SPORTSDATAIO_KEY },
      });
      if (r.ok) {
        const raw = await r.json();
        games = (raw ?? []).map((g: any) => {
          const kickoff =
            g.Date || g.Day || g.DateTime || g.Updated || new Date().toISOString();
          return {
            id:
              String(g.GameID ?? g.GameKey ?? g.GlobalGameID ??
              `${g.Season}-${g.Week}-${g.HomeTeam}-${g.AwayTeam}`),
            league: sport.toUpperCase(),
            date,
            kickoff,
            status: g.Status ?? "Scheduled",
            home: g.HomeTeam,
            away: g.AwayTeam,
            homeScore: g.HomeScore ?? null,
            awayScore: g.AwayScore ?? null,
          };
        });
      } else {
        upstream = `sportsdataio:${r.status}`;
        // fall through to TheSportsDB
      }
    }

    // Fallback: TheSportsDB (American Football day view)
    if (games.length === 0) {
      upstream = "thesportsdb";
      const d = new Date(date);
      const yyyy = d.getUTCFullYear();
      const mm = pad(d.getUTCMonth() + 1);
      const dd = pad(d.getUTCDate());
      const r = await fetch(
        `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/eventsday.php?d=${yyyy}-${mm}-${dd}&s=American%20Football`,
      );
      if (r.ok) {
        const raw = await r.json();
        const evts = raw?.events ?? [];
        games = evts.map((e: any) => ({
          id: String(e.idEvent),
          league: "NFL",
          date,
          kickoff: e.dateEvent + "T" + (e.strTime || "00:00:00") + "Z",
          status: "Scheduled",
          home: e.strHomeTeam,
          away: e.strAwayTeam,
          homeScore: e.intHomeScore ? Number(e.intHomeScore) : null,
          awayScore: e.intAwayScore ? Number(e.intAwayScore) : null,
        }));
      }
    }

    return json(200, { ok: true, sport, date, upstream, count: games.length, games });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
});
