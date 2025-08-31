// app/tournaments/TournamentStatus.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, ActivityIndicator } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
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

export default function TournamentStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // Your entries with tournaments
        const { data: entries, error } = await supabase
          .from("tournament_entries")
          .select("id, status, tournament_id, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const enriched = [];
        for (const e of entries || []) {
          const t = e.tournaments;
          const slate = await loadSlateGames(t.sport, t.window_start, t.window_end);
          // load your picks
          const { data: p, error: pErr } = await supabase.from("picks").select("game_id, pick_side").eq("entry_id", e.id);
          if (pErr) throw pErr;
          const pickMap = {}; (p || []).forEach((r) => { pickMap[r.game_id] = r.pick_side; });

          // evaluate
          let correct = 0, wrong = 0, pending = 0;
          for (const g of slate) {
            const side = pickMap[g.id];
            if (!side) { pending++; continue; }
            if (!g.done) { pending++; continue; }
            if (g.winner && side === g.winner) correct++; else wrong++;
          }
          const eliminated = wrong > 0; // sudden death
          const status = Date.now() >= new Date(t.close_at).getTime() ? "Locked" : "Open";
          enriched.push({
            entryId: e.id,
            name: t.name,
            sport: String(t.sport || "").toUpperCase(),
            closes: new Date(t.close_at).toLocaleString(),
            status,
            correct, wrong, pending,
            eliminated,
          });
        }

        if (on) setCards(enriched);
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
      const home = g.HomeTeamName || g.HomeTeam || g.HomeTeamKey || g.HomeTeamAbbreviation;
      const away = g.AwayTeamName || g.AwayTeam || g.AwayTeamKey || g.AwayTeamAbbreviation;
      const dt = new Date(g.DateTime || g.Day);
      const status = String(g.Status || "").toLowerCase();
      const done = status.includes("final") || status.startsWith("f/");
      const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
      const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
      const winner = done && hs != null && as != null ? (hs > as ? "home" : (as > hs ? "away" : null)) : null;
      return { id: String(id), home, away, when: dt, done, winner };
    });
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Your Tournament Status</Text>

        {cards.length === 0 && <Text style={styles.empty}>No active entries.</Text>}

        {cards.map((c) => (
          <View key={c.entryId} style={styles.card}>
            <Text style={styles.name}>{c.name} • {c.sport}</Text>
            <Text style={styles.sub}>Closes: {c.closes} • Status: <Text style={{ color: GOLD }}>{c.status}</Text></Text>

            {/* Progress pills */}
            <View style={styles.pills}>
              <Pill color="#22c55e" label="Correct" value={c.correct} />
              <Pill color="#f59e0b" label="Pending" value={c.pending} />
              <Pill color="#ef4444" label="Wrong" value={c.wrong} />
            </View>

            {/* Elimination banner */}
            {c.eliminated ? (
              <View style={[styles.banner, { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }]}>
                <Text style={[styles.bannerText, { color: "#ef4444" }]}>Eliminated</Text>
              </View>
            ) : (
              <View style={[styles.banner, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" }]}>
                <Text style={[styles.bannerText, { color: "#22c55e" }]}>Still Alive</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => router.push(`/entries/${c.entryId}`)} style={styles.manageBtn}>
              <Text style={styles.manageTxt}>Manage Picks</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ImageBackground>
  );
}

function Pill({ color, label, value }) {
  return (
    <View style={[pillStyles.pill, { borderColor: color, backgroundColor: "rgba(255,255,255,0.05)" }]}>
      <Text style={[pillStyles.val, { color }]}>{value}</Text>
      <Text style={pillStyles.lab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) },
  title: { fontSize: RFValue(22), fontWeight: "900", color: "#fff", marginTop: RFValue(6), marginBottom: RFValue(12) },
  empty: { color: "#ddd", marginTop: RFValue(8) },

  card: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: RFValue(16), padding: RFValue(16), marginBottom: RFValue(12), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", marginTop: RFValue(6), fontSize: RFValue(12) },

  pills: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(12) },
  banner: { marginTop: RFValue(12), padding: RFValue(10), borderRadius: RFValue(10), borderWidth: 1, alignItems: "center" },
  bannerText: { fontWeight: "900" },

  manageBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), alignItems: "center", marginTop: RFValue(12) },
  manageTxt: { color: "#fff", fontWeight: "900" },
});

const pillStyles = StyleSheet.create({
  pill: { flexDirection: "column", alignItems: "center", borderRadius: RFValue(10), borderWidth: 1, paddingVertical: RFValue(8), paddingHorizontal: RFValue(12), minWidth: RFValue(90) },
  val: { fontSize: RFValue(16), fontWeight: "900" },
  lab: { color: "#ddd", fontSize: RFValue(11), marginTop: RFValue(2) },
});
