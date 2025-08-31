// utils/tournaments.ts
import { supabase } from "@/lib/supabase";

export async function listOpenTournaments() {
  const today = new Date().toISOString().slice(0,10);
  return supabase
    .from("tournaments")
    .select("*")
    .eq("status","open")
    .gte("window_start", today)
    .order("sport", { ascending: true })
    .order("tier", { ascending: true });
}
