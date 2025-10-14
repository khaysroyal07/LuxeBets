// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std/http/server.ts";

const API_KEY = Deno.env.get("SPORTSDATAIO_KEY")!;
const BASE = "https://api.sportsdata.io/v4/odds/json";

type Payload = {
  league: 'nba' | 'nfl' | 'mlb' | 'nhl' | 'ncaafb' | 'ncaamb';
  date?: string; // 'YYYY-MM-DD'
};

serve(async (req) => {
  try {
    const { league, date }: Payload = await req.json();
    if (!league) throw new Error("league is required");

    const day = date ?? new Date().toISOString().slice(0,10);

    // 1) Get day's betting events
    const eventsRes = await fetch(`${BASE}/${league}/BettingEventsByDate/${day}`, {
      headers: { 'Ocp-Apim-Subscription-Key': API_KEY }
    });
    if (!eventsRes.ok) throw new Error(`Events error ${eventsRes.status}`);
    const allEvents = await eventsRes.json();

    // 2) Filter to not-started
    const nowISO = new Date().toISOString();
    const upcoming = allEvents.filter((e: any) => e.StartDateTime > nowISO);

    // 3) Fetch markets for each event
    const results = await Promise.all(upcoming.map(async (e: any) => {
      const marketsRes = await fetch(`${BASE}/${league}/BettingMarketsByEvent/${e.BettingEventID}`, {
        headers: { 'Ocp-Apim-Subscription-Key': API_KEY }
      });
      const markets = marketsRes.ok ? await marketsRes.json() : [];

      const pickMarket = (rx: RegExp) => markets.find((m: any) => rx.test(String(m.Name)));
      const moneyline = pickMarket(/Moneyline/i);
      const spread    = pickMarket(/(Spread|Point Spread)/i);
      const total     = pickMarket(/(Total|Over\/Under)/i);

      return {
        event: {
          id: e.BettingEventID,
          startsAt: e.StartDateTime,
          homeTeam: e.HomeTeam,
          awayTeam: e.AwayTeam,
          league: e.League,
        },
        markets: {
          moneyline: moneyline?.BettingOutcomes ?? [],
          spread:    spread?.BettingOutcomes ?? [],
          total:     total?.BettingOutcomes ?? [],
        }
      };
    }));

    return new Response(JSON.stringify({ results }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
  }
});
