// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const KEY = Deno.env.get("SPORTSDATAIO_KEY") || "";
const BASE = "https://api.sportsdata.io/v3";

const ok = (p:any, status=200)=>
  new Response(JSON.stringify(p),{status,headers:{"Content-Type":"application/json"}});

function resolveLeague(league:string){
  const l = league.toLowerCase();
  if (["mlb","baseball"].includes(l)) return "mlb";
  if (["nfl","football"].includes(l)) return "nfl";
  if (["nba","basketball"].includes(l)) return "nba";
  return "mlb";
}

serve(async (req)=>{
  try {
    if (req.method!=="POST") return ok({ok:false, code:"METHOD"},405);
    const b = await req.json().catch(()=>({}));
    const league = resolveLeague(b?.league || "mlb");
    const want   = (b?.want || "teams") as "teams"|"standings";
    const headers = { "Ocp-Apim-Subscription-Key": KEY };

    if (!KEY) return ok({ ok:false, code:"NO_KEY" }, 400);

    if (want === "teams") {
      const url = `${BASE}/${league}/scores/json/teams`;
      const r   = await fetch(url, { headers });
      if (!r.ok) return ok({ ok:false, code:"HTTP", status:r.status }, r.status);
      const j   = await r.json();
      const teams = (Array.isArray(j)?j:[]).map((t:any)=>({
        id: String(t?.TeamID ?? t?.GlobalTeamID ?? t?.Key),
        key: t?.Key,
        city: t?.City,
        name: t?.Name,
        full: t?.City && t?.Name ? `${t.City} ${t.Name}` : (t?.Name ?? t?.Key),
        conference: t?.Conference ?? null,
        division: t?.Division ?? null,
        logo: t?.WikipediaLogoUrl ?? null,
      }));
      return ok({ ok:true, league, count: teams.length, teams });
    } else {
      // standings (season required), attempt common endpoint
      const season = String(b?.season || new Date().getUTCFullYear());
      const url = `${BASE}/${league}/scores/json/Standings/${season}`;
      const r   = await fetch(url, { headers });
      if (!r.ok) return ok({ ok:false, code:"HTTP", status:r.status }, r.status);
      const j   = await r.json();
      return ok({ ok:true, league, season, data: j });
    }
  } catch (e:any){
    return ok({ ok:false, code:"UNHANDLED", message:String(e?.message||e) }, 500);
  }
});
