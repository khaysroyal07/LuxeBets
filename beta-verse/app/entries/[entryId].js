// app/entries/[entryId].js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

// SportsDataIO endpoints
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

export default function EntryPicks() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [tour, setTour] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [saving, setSaving] = useState(false);

  // Load entry + tournament and existing picks
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        const { data: eData, error: eErr } = await supabase
          .from("tournament_entries")
          .select("id, tournament_id, tournaments(*)")
          .eq("id", entryId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (!eData) throw new Error("Entry not found");

        const t = eData.tournaments;
        if (on) {
          setEntry(eData);
          setTour(t);
        }

        // existing picks
        const { data: pData, error: pErr } = await supabase
          .from("picks")
          .select("game_id, pick_side")
          .eq("entry_id", entryId);
        if (pErr) throw pErr;
        const map = {};
        (pData || []).forEach((r) => { map[r.game_id] = r.pick_side; });
        if (on) setPicks(map);

        // load slate games
        const slate = await loadSlateGames(t.sport, t.window_start, t.window_end);
        if (on) setGames(slate);
      } catch (e) {
        console.warn(e);
        Alert.alert("Error", e.message || "Failed to load entry");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [entryId]);

  async function loadSlateGames(sport, startDate, endDate) {
    const cfg = SPORT_CFG[sport];
    if (!cfg || !SDIO_KEY) return [];
    const headers = { "Ocp-Apim-Subscription-Key": SDIO_KEY };

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    const all = [];
    for (const d of days) {
      const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(toSDIODate(d))}?key=${encodeURIComponent(SDIO_KEY)}`;
      const resp = await fetch(url, { headers }).catch(() => null);
      if (!resp || !resp.ok) continue;
      const arr = await resp.json();
      if (Array.isArray(arr)) all.push(...arr);
    }

    // normalize
    const norm = all.map((g) => {
      const id = g.GameID || g.GameId || g.GlobalGameID || `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`;
      const home = g.HomeTeamName || g.HomeTeam || g.HomeTeamKey || g.HomeTeamAbbreviation;
      const away = g.AwayTeamName || g.AwayTeam || g.AwayTeamKey || g.AwayTeamAbbreviation;
      const dt = new Date(g.DateTime || g.Day);
      const status = String(g.Status || "").toLowerCase();
      const done = status.includes("final") || status.startsWith("f/");
      const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
      const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
      let winner = null;
      if (done && hs != null && as != null) winner = hs > as ? "home" : (as > hs ? "away" : null);
      return { id: String(id), home: String(home || "Home"), away: String(away || "Away"), when: dt, done, winner, hs, as };
    });

    // de-dup by id
    const seen = new Set(); const list = [];
    for (const g of norm) { if (seen.has(g.id)) continue; seen.add(g.id); list.push(g); }
    // sort by time
    list.sort((a, b) => (a.when?.getTime?.() || 0) - (b.when?.getTime?.() || 0));
    return list;
  }

  const togglePick = (gameId, side) => {
    setPicks((prev) => ({ ...prev, [gameId]: prev[gameId] === side ? null : side }));
  };

  const savePicks = async () => {
    try {
      setSaving(true);
      const rows = Object.entries(picks)
        .filter(([, side]) => side === "home" || side === "away")
        .map(([game_id, pick_side]) => ({ entry_id: entryId, game_id, pick_side }));

      // upsert by unique(entry_id, game_id)
      if (rows.length === 0) return Alert.alert("No picks", "Select at least one game.");
      const { error } = await supabase.from("picks").upsert(rows, { onConflict: "entry_id,game_id" });
      if (error) throw error;
      Alert.alert("Saved", "Your picks are saved.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save picks.");
    } finally {
      setSaving(false);
    }
  };

  const locked = useMemo(() => (tour ? Date.now() >= new Date(tour.close_at).getTime() : false), [tour]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(80) }}>
        <Text style={styles.title}>{tour?.name} • {String(tour?.sport || "").toUpperCase()}</Text>
        <Text style={styles.sub}>Window: {tour?.window_start} → {tour?.window_end} · Closes {new Date(tour?.close_at).toLocaleString()}</Text>

        {games.length === 0 && <Text style={styles.empty}>No games in this slate.</Text>}

        {games.map((g) => {
          const pick = picks[g.id] || null;
          return (
            <View key={g.id} style={styles.gameRow}>
              <Text style={styles.when}>{g.when.toLocaleString()}</Text>
              <View style={styles.teamsRow}>
                <TouchableOpacity
                  disabled={locked || g.done}
                  onPress={() => togglePick(g.id, "home")}
                  style={[styles.sideBtn, pick === "home" && styles.sideSelected, (locked || g.done) && styles.sideDisabled]}
                >
                  <Text style={styles.sideTxt}>{g.home}</Text>
                </TouchableOpacity>
                <Text style={styles.vs}>vs</Text>
                <TouchableOpacity
                  disabled={locked || g.done}
                  onPress={() => togglePick(g.id, "away")}
                  style={[styles.sideBtn, pick === "away" && styles.sideSelected, (locked || g.done) && styles.sideDisabled]}
                >
                  <Text style={styles.sideTxt}>{g.away}</Text>
                </TouchableOpacity>
              </View>
              {g.done && (
                <Text style={styles.final}>
                  Final: {g.home} {g.hs ?? "-"} - {g.away} {g.as ?? "-"} • Winner: {g.winner || "—"}
                </Text>
              )}
            </View>
          );
        })}

        <TouchableOpacity disabled={saving || locked} onPress={savePicks} style={[styles.saveBtn, (saving || locked) && { opacity: 0.6 }]}>
          <Text style={styles.saveTxt}>{locked ? "Locked" : "Save Picks"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(20) },
  sub: { color: "#ccc", marginTop: RFValue(6), marginBottom: RFValue(10), fontSize: RFValue(12) },
  empty: { color: "#ddd", marginTop: RFValue(8) },

  gameRow: { backgroundColor: "rgba(0,0,0,0.6)", padding: RFValue(12), borderRadius: RFValue(12), marginBottom: RFValue(10), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  when: { color: GOLD, fontWeight: "700", marginBottom: RFValue(6) },
  teamsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideBtn: { flex: 1, backgroundColor: "#333", borderRadius: RFValue(10), paddingVertical: RFValue(10), paddingHorizontal: RFValue(8), alignItems: "center" },
  sideSelected: { backgroundColor: PURPLE },
  sideDisabled: { backgroundColor: "#555" },
  sideTxt: { color: "#fff", fontWeight: "800", textAlign: "center" },
  vs: { color: "#fff", marginHorizontal: RFValue(8) },
  final: { color: "#bbb", marginTop: RFValue(6), fontSize: RFValue(12) },

  saveBtn: { backgroundColor: "#2c91a1", padding: RFValue(12), borderRadius: RFValue(12), marginTop: RFValue(8), alignItems: "center" },
  saveTxt: { color: "#fff", fontWeight: "900" },

  backBtn: { alignItems: "center", padding: RFValue(10), marginTop: RFValue(8) },
  backTxt: { color: PURPLE, fontWeight: "800" },
});
