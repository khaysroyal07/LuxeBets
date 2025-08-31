// app/tournaments/TournamentHistory.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, FlatList } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

const SPORT_CFG = {
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  gamesByDate: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", gamesByDate: "GamesByDate" },
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  gamesByDate: "GamesByDate" },
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  gamesByDate: "ScoresByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  gamesByDate: "GamesByDate" },
};
const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY ||
  "";

function toSDIODate(d) {
  const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = d.getFullYear(), mm = MONTHS_ABBR[d.getMonth()], dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function TournamentHistory() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);

        // Past entries (where window_end < today)
        const { data: entries, error } = await supabase
          .from("tournament_entries")
          .select("id, joined_at, tournaments(*)")
          .lt("tournaments.window_end", today)
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const out = [];
        for (const e of entries || []) {
          const t = e.tournaments;
          const slate = await loadSlateGames(t.sport, t.window_start, t.window_end);

          const { data: p, error: pErr } = await supabase.from("picks").select("game_id, pick_side").eq("entry_id", e.id);
          if (pErr) throw pErr;
          const map = {}; (p || []).forEach((r) => { map[r.game_id] = r.pick_side; });

          let correct = 0, wrong = 0;
          for (const g of slate) {
            const side = map[g.id];
            if (!side || !g.done || !g.winner) continue;
            if (side === g.winner) correct++; else wrong++;
          }

          out.push({
            id: e.id,
            name: t.name,
            sport: String(t.sport || "").toUpperCase(),
            entryFee: t.tier ? Number(t.tier) : 0,
            date: t.window_end,
            result: wrong > 0 ? "Loss" : (correct > 0 ? "Win/Alive" : "Pending"),
            correct, wrong,
          });
        }
        if (on) setRows(out);
      } catch (e) {
        console.warn(e);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  async function loadSlateGames(sport, startDate, endDate) {
    if (!SDIO_KEY) return [];
    const cfg = SPORT_CFG[sport]; if (!cfg) return [];
    const headers = { "Ocp-Apim-Subscription-Key": SDIO_KEY };
    const start = new Date(startDate), end = new Date(endDate);
    const days = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    const all = [];
    for (const d of days) {
      const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(toSDIODate(d))}?key=${encodeURIComponent(SDIO_KEY)}`;
      const resp = await fetch(url, { headers }).catch(() => null);
      if (!resp || !resp.ok) continue;
      const arr = await resp.json();
      if (Array.isArray(arr)) all.push(...arr);
    }

    return all.map((g) => {
      const id = g.GameID || g.GameId || g.GlobalGameID || `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`;
      const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
      const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
      const status = String(g.Status || "").toLowerCase();
      const done = status.includes("final") || status.startsWith("f/");
      const winner = done && hs != null && as != null ? (hs > as ? "home" : (as > hs ? "away" : null)) : null;
      return { id: String(id), done, winner };
    });
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={rows}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={<Text style={styles.title}>Tournament History</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name} • {item.sport}</Text>
            <Text style={styles.line}>Entry: <Text style={{ color: GOLD }}>${item.entryFee.toFixed(2)}</Text></Text>
            <Text style={styles.line}>Result: {item.result}  ·  Correct: {item.correct}  ·  Wrong: {item.wrong}</Text>
            <Text style={styles.line}>Date: {item.date}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#ddd" }}>No history yet.</Text>}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(22), marginBottom: RFValue(10) },
  card: { backgroundColor: "rgba(0,0,0,0.6)", padding: RFValue(16), borderRadius: RFValue(16), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, marginBottom: RFValue(10) },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginBottom: RFValue(6) },
  line: { color: "#ddd", fontSize: RFValue(12), marginTop: RFValue(2) },
});
