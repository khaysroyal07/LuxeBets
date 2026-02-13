import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type SportKey = "nfl" | "nba" | "mlb" | "nhl" | "wnba";

const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_KEY") ?? "";

const API: Record<
  SportKey,
  {
    base: string;
    teams: string;
    gamesByDate?: string;
    scoresByDate?: string;
    oddsByDate?: string;
    oddsByWeek?: string;
  }
> = {
  nfl: {
    base: "https://api.sportsdata.io/v3/nfl",
    teams: "scores/json/Teams",
    scoresByDate: "scores/json/ScoresByDate",
    oddsByWeek: "odds/json/GameOddsByWeek",
  },
  nba: {
    base: "https://api.sportsdata.io/v3/nba",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  mlb: {
    base: "https://api.sportsdata.io/v3/mlb",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  nhl: {
    base: "https://api.sportsdata.io/v3/nhl",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
  wnba: {
    base: "https://api.sportsdata.io/v3/wnba",
    teams: "scores/json/teams",
    gamesByDate: "scores/json/GamesByDate",
    oddsByDate: "odds/json/GameOddsByDate",
  },
};

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

const json = (body: any, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });

const withKey = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(SPORTSDATAIO_KEY)}`;

async function fetchJson(url: string) {
  const r = await fetch(url);
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) return { ok: false, status: r.status, data };
  return { ok: true, status: r.status, data };
}

type Body =
  | { op: "teams"; sport: SportKey }
  | { op: "gamesByDate"; sport: SportKey; date: string }
  | { op: "oddsByDate"; sport: Exclude<SportKey, "nfl">; date: string }
  | { op: "oddsByWeek"; sport: "nfl"; season: number | string; week: number | string };

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  try {
    if (!SPORTSDATAIO_KEY) {
      return json({ ok: false, status: 500, error: "SPORTSDATAIO_KEY missing in Edge secrets" }, 500, origin);
    }

    const body = (await req.json()) as Body;
    if (!body || !(body as any).op || !(body as any).sport) {
      return json({ ok: false, status: 400, error: "Invalid body" }, 400, origin);
    }

    const sport = (body as any).sport as SportKey;
    const cfg = API[sport];
    if (!cfg) return json({ ok: false, status: 400, error: "Unsupported sport" }, 400, origin);

    let url = "";

    if (body.op === "teams") {
      url = withKey(`${cfg.base}/${cfg.teams}`);
    } else if (body.op === "gamesByDate") {
      const path = sport === "nfl" ? cfg.scoresByDate : cfg.gamesByDate;
      if (!path) return json({ ok: false, status: 400, error: "Missing schedule endpoint" }, 400, origin);
      url = withKey(`${cfg.base}/${path}/${body.date}`);
    } else if (body.op === "oddsByDate") {
      if (sport === "nfl") return json({ ok: false, status: 400, error: "Use oddsByWeek for NFL" }, 400, origin);
      if (!cfg.oddsByDate) return json({ ok: false, status: 400, error: "Missing odds endpoint" }, 400, origin);
      url = withKey(`${cfg.base}/${cfg.oddsByDate}/${body.date}`);
    } else if (body.op === "oddsByWeek") {
      if (sport !== "nfl") return json({ ok: false, status: 400, error: "oddsByWeek is NFL only" }, 400, origin);
      if (!cfg.oddsByWeek) return json({ ok: false, status: 400, error: "Missing NFL odds endpoint" }, 400, origin);
      url = withKey(`${cfg.base}/${cfg.oddsByWeek}/${body.season}/${body.week}`);
    }

    const out = await fetchJson(url);

    if (!out.ok) {
      if (out.status === 401 || out.status === 403) {
        return json({ ok: false, status: out.status, planBlocked: true, data: out.data }, 200, origin);
      }
      if (out.status === 404) {
        return json({ ok: true, status: 404, data: [] }, 200, origin);
      }
      return json({ ok: false, status: out.status, data: out.data }, 200, origin);
    }

    return json({ ok: true, status: out.status, data: out.data }, 200, origin);
  } catch (e) {
    return json({ ok: false, status: 500, error: String(e?.message ?? e) }, 500, origin);
  }
});
