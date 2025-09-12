// lib/tournaments.ts
import { supabase } from "@/lib/supabase";

const PLANETS_BY_RANK = ["Mars", "Jupiter", "Saturn"]; 
// If you add tiers in the future, extend here:
// ["Mercury","Mars","Venus","Earth","Neptune","Uranus","Saturn","Jupiter"]

export type PlanetNamedTournament = {
  id: number;
  day_date: string;
  entry_fee: number;
  status: string;
  week_label: string | null;
  planet_name: string;   // <- computed
  rank_in_week: number;  // 0 = cheapest
};

/**
 * Return all tournaments that share the same week window as `day_date`.
 * Rank by price (asc) and assign planet_name from PLANETS_BY_RANK.
 */
export async function fetchWeekTournamentsWithPlanets(day_date: string) {
  // we treat "week" as same day_date window (the Tue-Thu block you use)
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, day_date, entry_fee, status, week_label")
    .eq("day_date", day_date)
    .order("entry_fee", { ascending: true });
  if (error) throw error;

  const list = (data || []).map((t, i) => ({
    ...t,
    planet_name: PLANETS_BY_RANK[i] || `Tier ${i + 1}`,
    rank_in_week: i,
  })) as PlanetNamedTournament[];

  return list;
}

/** Given a tournament row (id, day_date, entry_fee), derive its planet name. */
export async function planetNameForTournament(
  tid: number,
  day_date: string
): Promise<{ planet_name: string; rank_in_week: number }> {
  const week = await fetchWeekTournamentsWithPlanets(day_date);
  const hit = week.find((t) => t.id === tid);
  if (!hit) return { planet_name: "Tournament", rank_in_week: -1 };
  return { planet_name: hit.planet_name, rank_in_week: hit.rank_in_week };
}
