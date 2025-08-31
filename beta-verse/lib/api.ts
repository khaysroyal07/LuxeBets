import { FUNCTIONS_BASE } from "./supabase";

export async function listTournaments() {
  const r = await fetch(`${FUNCTIONS_BASE}/list_tournaments`);
  return r.json();
}

export async function joinTournament(token: string, tournament_id: string) {
  const r = await fetch(`${FUNCTIONS_BASE}/join_tournament`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
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

export async function submitPick(token: string, payload: {
  entrant_id: string; game_id: string; selection: "HOME" | "AWAY";
}) {
  const r = await fetch(`${FUNCTIONS_BASE}/submit_pick`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return r.json();
}
