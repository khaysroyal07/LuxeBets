// lib/api.ts
import { supabase } from "@/lib/supabase";

// Use this if you already export FUNCTIONS_BASE in supabase.ts
import { FUNCTIONS_BASE } from "./supabase";

/* ============================================================
   SUPABASE-BASED TOURNAMENT + ENTRY HELPERS
============================================================ */

export async function loadCurrentTournaments() {
  const { data, error } = await supabase
    .from("current_tournaments_v")
    .select("*")
    .order("end_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function loadTournamentHistory() {
  const { data, error } = await supabase
    .from("tournament_history_v")
    .select("*")
    .order("end_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function joinTournament(
  tournament_id: string,
  tier: string,
  user_id: string
) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/join_tournament`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ tournament_id, user_id, tier }),
    }
  );
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Failed to join");
  return j.entry;
}

export function entryLabel(
  entry: { status: string },
  t: { status: string; end_at: string | null }
) {
  if (entry.status === "eliminated") return "Eliminated";
  if (entry.status === "won") return "Winner";
  if (
    (t.end_at && new Date(t.end_at) <= new Date()) ||
    t.status === "settled"
  )
    return "Finished";
  return "Active";
}

export async function loadBettingPicks(league: string, dateISO?: string) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-betting-markets`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ league, date: dateISO }),
    }
  );
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Betting feed failed");
  return j.results as Array<{
    event: {
      id: string;
      startsAt: string;
      homeTeam: string;
      awayTeam: string;
      league: string;
    };
    markets: { moneyline: any[]; spread: any[]; total: any[] };
  }>;
}

/* ============================================================
   ADDITIONAL CLOUD FUNCTION HELPERS (your new ones)
============================================================ */

export async function listTournaments() {
  const r = await fetch(`${FUNCTIONS_BASE}/list_tournaments`);
  return r.json();
}

export async function joinTournamentCloud(token: string, tournament_id: string) {
  const r = await fetch(`${FUNCTIONS_BASE}/join_tournament`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tournament_id }),
  });
  return r.json();
}

export async function gamesToday() {
  const r = await fetch(`${FUNCTIONS_BASE}/games_today`);
  return r.json();
}

export async function submitPick(
  token: string,
  payload: { entrant_id: string; game_id: string; selection: "HOME" | "AWAY" }
) {
  const r = await fetch(`${FUNCTIONS_BASE}/submit_pick`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return r.json();
}
