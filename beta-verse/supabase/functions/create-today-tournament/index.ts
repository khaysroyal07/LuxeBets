import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

const SPORTS_API = "https://app.sportdataapi.com/api/v1/soccer/matches";

serve(async () => {
  try {
    const today = new Date();
    const nextTuesday = getNextDay(today, 2); // Tue
    const nextThursday = getNextDay(today, 4); // Thu

    const fromDate = nextTuesday.toISOString().split("T")[0];
    const toDate = nextThursday.toISOString().split("T")[0];

    const resp = await fetch(
      `${SPORTS_API}?apikey=${Deno.env.get("SPORTS_API_KEY")}&date_from=${fromDate}&date_to=${toDate}`
    );
    const json = await resp.json();

    if (!json?.data || json.data.length === 0) {
      return new Response(JSON.stringify({ error: "No fixtures found" }), { status: 400 });
    }

    const leagueName = json.data[0]?.league?.name ?? "Unknown League";

    const entryTiers = [20, 50, 100];
    const tournaments = entryTiers.map((amount) => ({
      league_name: leagueName,
      week_number: getWeekNumber(today),
      entry_amount: amount,
      prize_pool: 0,
      start_date: fromDate,
      end_date: toDate,
      status: "upcoming",
    }));

    const { data, error } = await supabase.from("tournaments").insert(tournaments);
    if (error) throw error;

    return new Response(JSON.stringify({ created: data?.length, tournaments: data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});

function getNextDay(date: Date, dayOfWeek: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() + ((7 + dayOfWeek - date.getDay()) % 7));
  return result;
}
function getWeekNumber(d: Date): number {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
