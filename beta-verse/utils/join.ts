// utils/join.ts
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

export async function joinTournament(tournamentId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please log in first");
  const base = Constants.expoConfig?.extra?.FUNCTIONS_URL; // e.g. https://<REF>.functions.supabase.co
  const res = await fetch(`${base}/join-tournament`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ tournament_id: tournamentId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Failed to join");
  return j;
}
