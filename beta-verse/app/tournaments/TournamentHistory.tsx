// app/tournaments/TournamentHistory.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

/* SportsDataIO (to evaluate win/loss) */
const SPORT_CFG = {
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  gamesByDate: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", gamesByDate: "GamesByDate" },
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  gamesByDate: "GamesByDate" },
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  gamesByDate: "ScoresByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  gamesByDate: "GamesByDate" },
};
const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY || "";

const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIODate = (d) => `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;

const nameFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

export default function TournamentHistory() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const router = useRouter();

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);

        // Past entrants (day_date < today OR status in settled/cancelled)
        const { data: ents, error } = await supabase
          .from("entrants")
          .select("id, joined_at, status, tournaments(*)")
          .or(`tournaments.day_date.lt.${today},tournaments.status.in.(settled,cancelled)`)
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const out = [];
        for (const e of ents || []) {
          const t = e.tournaments;
          const day = new Date(t.day_date);

          // fetch the one pick you made (if any)
          const { data: p, error: pErr } = await supabase
            .from("picks")
            .select("game_id, selection")
            .eq("tournament_id", t.id)
            .eq("pick_date", t.day_date)
            .limit(1)
            .maybeSingle();
          if (pErr) throw pErr;

          let result = "No Pick";
          if (p?.game_id) {
            const g = await findGameForId(day, p.game_id);
            if (g && g.done) {
              if (g.winner === p.selection) result = "WIN";
              else if (g.winner && g.winner !== p.selection) result = "LOSS";
              else result = "PUSH/VOID";
            } else {
              result = "Pending";
            }
          }

          out.push({
            id: e.id,
            name: nameFor(t),
            entryFee: t.entry_fee,
            date: t.day_date,
            result,
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

  async function findGameForId(dayDate, gameId) {
    if (!SDIO_KEY) return null;
    const headers = { "Ocp-Apim-Subscription-Key": SDIO_KEY };
    const sdioDate = toSDIODate(dayDate);

    const lists = await Promise.all(
      Object.values(SPORT_CFG).map(async (cfg) => {
        const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
        const resp = await fetch(url, { headers }).catch(() => null);
        if (!resp || !resp.ok) return [];
        const arr = await resp.json();
        return Array.isArray(arr) ? arr : [];
      })
    );
    const flat = lists.flat();
    for (const g of flat) {
      const id = String(g.GameID || g.GameId || g.GlobalGameID || `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`);
      if (id !== String(gameId)) continue;
      const status = String(g.Status || "").toLowerCase();
      const done = status.includes("final") || status.startsWith("f/");
      const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
      const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
      let winner = null;
      if (done && hs != null && as != null) winner = hs > as ? "home" : (as > hs ? "away" : null);
      return { done, winner };
    }
    return null;
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => router.push('../(tabs)/tournaments')}><Text style={{marginTop: RFValue(50),marginBottom: RFValue(20), color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) }}>← Back</Text></TouchableOpacity>
      
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={rows}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={<Text style={styles.title}>Tournament History</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name} • ANY</Text>
            <Text style={styles.line}>Entry: <Text style={{ color: GOLD }}>${Number(item.entryFee).toFixed(2)}</Text></Text>
            <Text style={styles.line}>Result: {item.result}</Text>
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
