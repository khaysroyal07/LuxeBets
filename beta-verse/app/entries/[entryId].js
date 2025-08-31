// app/entries/[entryId].js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

/* SportsDataIO (multi-sport day slate) */
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

const titleFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

export default function EntryPicks() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [tour, setTour] = useState(null);
  const [games, setGames] = useState([]);
  const [pick, setPick] = useState(null); // { game_id, selection }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // Entrant + tournament
        const { data: eData, error: eErr } = await supabase
          .from("entrants")
          .select("id, tournament_id, tournaments(*)")
          .eq("id", entryId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (!eData) throw new Error("Entry not found");
        const t = eData.tournaments;
        if (on) { setEntry(eData); setTour(t); }

        // Existing pick (RLS will scope to user automatically)
        const { data: pData, error: pErr } = await supabase
          .from("picks")
          .select("game_id, selection, pick_date")
          .eq("tournament_id", t.id)
          .eq("pick_date", t.day_date)
          .limit(1)
          .maybeSingle();
        if (pErr) throw pErr;
        if (on && pData) setPick({ game_id: pData.game_id, selection: pData.selection });

        // Load slate for the day across supported sports
        const slate = await loadDaySlate(new Date(t.day_date));
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

  async function loadDaySlate(dayDate) {
    if (!SDIO_KEY) return [];
    const headers = { "Ocp-Apim-Subscription-Key": SDIO_KEY };
    const sdioDate = toSDIODate(dayDate);

    const all = await Promise.all(
      Object.values(SPORT_CFG).map(async (cfg) => {
        const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
        const resp = await fetch(url, { headers }).catch(() => null);
        if (!resp || !resp.ok) return [];
        const arr = await resp.json();
        return Array.isArray(arr) ? arr : [];
      })
    );

    const flat = all.flat();
    const norm = flat.map((g) => {
      const id = g.GameID || g.GameId || g.GlobalGameID || `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`;
      const home = g.HomeTeamName || g.HomeTeam || g.HomeTeamKey || g.HomeTeamAbbreviation || "Home";
      const away = g.AwayTeamName || g.AwayTeam || g.AwayTeamKey || g.AwayTeamAbbreviation || "Away";
      const dt = new Date(g.DateTime || g.Day);
      const status = String(g.Status || "").toLowerCase();
      const done = status.includes("final") || status.startsWith("f/");
      const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
      const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
      let winner = null;
      if (done && hs != null && as != null) winner = hs > as ? "home" : (as > hs ? "away" : null);
      return { id: String(id), home: String(home), away: String(away), when: dt, done, winner, hs, as };
    });

    // dedupe by id + sort by time
    const seen = new Set(); const list = [];
    for (const g of norm) { if (seen.has(g.id)) continue; seen.add(g.id); list.push(g); }
    list.sort((a,b)=> (a.when?.getTime?.()||0) - (b.when?.getTime?.()||0));
    return list;
  }

  const togglePick = (gameId, side) => {
    // One pick total: set/replace, or clear if same side tapped twice
    setPick((prev) => {
      if (prev?.game_id === gameId && prev?.selection === side) return null;
      return { game_id: gameId, selection: side };
    });
  };

  const savePick = async () => {
    try {
      if (!pick?.game_id || !pick?.selection) return Alert.alert("No pick", "Select one game and a side.");
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const row = {
        tournament_id: tour.id,
        user_id: user.id,
        pick_date: tour.day_date,
        game_id: pick.game_id,
        selection: pick.selection,
        status: "PENDING",
      };

      const { error } = await supabase
        .from("picks")
        .upsert(row, { onConflict: "tournament_id,user_id,pick_date" });
      if (error) throw error;

      Alert.alert("Saved", "Your pick is saved.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save pick.");
    } finally {
      setSaving(false);
    }
  };

  const locked = useMemo(() => (tour ? Date.now() >= new Date(tour.join_close_at).getTime() : false), [tour]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => router.push('../(tabs)/tournaments')}><Text style={{marginTop: RFValue(50),marginBottom: RFValue(20), color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) }}>← Back</Text></TouchableOpacity>

      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(80) }}>
        <Text style={styles.title}>{titleFor(tour)} • ANY</Text>
        <Text style={styles.sub}>
          Day: {tour?.day_date}  ·  First game {tour?.start_at ? new Date(tour.start_at).toLocaleString() : "—"}  ·  Join closes {tour?.join_close_at ? new Date(tour.join_close_at).toLocaleString() : "—"}
        </Text>

        {games.length === 0 && <Text style={styles.empty}>No games in this slate.</Text>}

        {games.map((g) => {
          const isHome = pick?.game_id === g.id && pick?.selection === "home";
          const isAway = pick?.game_id === g.id && pick?.selection === "away";
          return (
            <View key={g.id} style={styles.gameRow}>
              <Text style={styles.when}>{g.when.toLocaleString()}</Text>
              <View style={styles.teamsRow}>
                <TouchableOpacity
                  disabled={locked || g.done}
                  onPress={() => togglePick(g.id, "home")}
                  style={[styles.sideBtn, isHome && styles.sideSelected, (locked || g.done) && styles.sideDisabled]}
                >
                  <Text style={styles.sideTxt}>{g.home}</Text>
                </TouchableOpacity>
                <Text style={styles.vs}>vs</Text>
                <TouchableOpacity
                  disabled={locked || g.done}
                  onPress={() => togglePick(g.id, "away")}
                  style={[styles.sideBtn, isAway && styles.sideSelected, (locked || g.done) && styles.sideDisabled]}
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

        <TouchableOpacity disabled={saving || locked} onPress={savePick} style={[styles.saveBtn, (saving || locked) && { opacity: 0.6 }]}>
          <Text style={styles.saveTxt}>{locked ? "Locked" : "Save Pick"}</Text>
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
