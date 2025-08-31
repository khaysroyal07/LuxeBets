// app/entries/[entryId].js
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, ScrollView, Alert
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

// SportsDataIO endpoints (we’ll aggregate across ALL of these for the day)
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

const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

function toSDIODate(d) {
  const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = d.getFullYear(), mm = MONTHS_ABBR[d.getMonth()], dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function EntryPicks() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams();         // ← treat as tournamentId
  const tournamentId = String(entryId);

  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState(null);             // tournament row
  const [entrant, setEntrant] = useState(null);       // my entrant row
  const [games, setGames] = useState([]);             // all sports for the day
  const [picks, setPicks] = useState({});             // { game_id: 'home'|'away' }
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) throw new Error("Sign in required");
        if (on) setUserId(u.user.id);

        // Tournament (ANY sport for the single day)
        const { data: t, error: tErr } = await supabase
          .from("tournaments")
          .select("*")
          .eq("id", tournamentId)
          .maybeSingle();
        if (tErr) throw tErr;
        if (!t) throw new Error("Tournament not found");
        if (on) setTour(t);

        // My entrant row
        const { data: ent, error: eErr } = await supabase
          .from("entrants")
          .select("*")
          .eq("tournament_id", tournamentId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (on) setEntrant(ent);

        // Existing picks (by user + tournament)
        const { data: pData, error: pErr } = await supabase
          .from("picks")
          .select("game_id, pick_side")
          .eq("tournament_id", tournamentId)
          .eq("user_id", u.user.id);
        if (pErr) throw pErr;
        const map = {};
        (pData || []).forEach((r) => { map[r.game_id] = r.pick_side; });
        if (on) setPicks(map);

        // Load ALL games for that day (multi-league)
        const day = t.day_date || (t.start_at ? new Date(t.start_at).toISOString().slice(0,10) : null);
        const slate = day ? await loadAllSportsGames(day) : [];
        if (on) setGames(slate);
      } catch (e) {
        console.warn(e);
        Alert.alert("Error", e.message || "Failed to load entry");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [tournamentId]);

  async function loadAllSportsGames(isoDay) {
    if (!SDIO_KEY) return [];
    const headers = { "Ocp-Apim-Subscription-Key": SDIO_KEY };
    const d = new Date(isoDay);
    const dateStr = toSDIODate(d);

    let all = [];
    for (const key of Object.keys(SPORT_CFG)) {
      const cfg = SPORT_CFG[key];
      const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(dateStr)}?key=${encodeURIComponent(SDIO_KEY)}`;
      const resp = await fetch(url, { headers }).catch(() => null);
      if (!resp || !resp.ok) continue;
      const arr = await resp.json();
      if (Array.isArray(arr)) {
        const norm = arr.map((g) => {
          const id = g.GameID || g.GameId || g.GlobalGameID || `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`;
          const home = g.HomeTeamName || g.HomeTeam || g.HomeTeamKey || g.HomeTeamAbbreviation || "Home";
          const away = g.AwayTeamName || g.AwayTeam || g.AwayTeamKey || g.AwayTeamAbbreviation || "Away";
          const dt = new Date(g.DateTime || g.Day);
          const status = String(g.Status || "").toLowerCase();
          const done = status.includes("final") || status.startsWith("f/");
          const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
          const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
          const winner = done && hs != null && as != null ? (hs > as ? "home" : (as > hs ? "away" : null)) : null;
          return { id: String(id), sport: key.toUpperCase(), home, away, when: dt, done, winner, hs, as };
        });
        all.push(...norm);
      }
    }

    // de-dup + sort
    const seen = new Set(); const list = [];
    for (const g of all) { if (seen.has(g.id)) continue; seen.add(g.id); list.push(g); }
    list.sort((a,b)=> (a.when?.getTime?.()||0) - (b.when?.getTime?.()||0));
    return list;
  }

  const togglePick = (gameId, side) => {
    setPicks((prev) => ({ ...prev, [gameId]: prev[gameId] === side ? null : side }));
  };

  const savePicks = async () => {
    try {
      if (!userId) return;
      setSaving(true);
      const rows = Object.entries(picks)
        .filter(([, side]) => side === "home" || side === "away")
        .map(([game_id, pick_side]) => ({
          user_id: userId,
          tournament_id: Number(tournamentId),
          game_id,
          pick_side,
        }));

      if (!rows.length) return Alert.alert("No picks", "Select at least one game.");

      // Upsert on (user_id, tournament_id, game_id)
      const { error } = await supabase
        .from("picks")
        .upsert(rows, { onConflict: "user_id,tournament_id,game_id" });
      if (error) throw error;

      Alert.alert("Saved", "Your picks are saved.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save picks.");
    } finally {
      setSaving(false);
    }
  };

  const locked = useMemo(() => (tour ? (tour.join_close_at ? Date.now() >= new Date(tour.join_close_at).getTime() : false) : false), [tour]);
  const eliminated = useMemo(() => (entrant?.status === "ELIMINATED"), [entrant]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  const fee = Number(tour?.entry_fee || 0);
  const name = TIER_TO_PLANET[String(fee)] || `Tournament $${fee}`;

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(90) }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={RFValue(18)} color={PURPLE} />
            <Text style={styles.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{name} • ANY</Text>
          <View style={{ width: RFValue(48) }} />
        </View>

        <Text style={styles.sub}>
          Day: {tour?.day_date || "—"} · Join closes: {tour?.join_close_at ? new Date(tour.join_close_at).toLocaleString() : "—"}
        </Text>
        <Text style={styles.sub}>Entry: <Text style={{ color: GOLD }}>{fmtMoney(fee)}</Text></Text>

        {eliminated && (
          <View style={[styles.banner, { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }]}>
            <Text style={[styles.bannerText, { color: "#ef4444" }]}>You have been eliminated</Text>
          </View>
        )}

        {games.length === 0 && <Text style={styles.empty}>No games in this day’s slate.</Text>}

        {games.map((g) => {
          const pick = picks[g.id] || null;
          return (
            <View key={g.id} style={styles.gameRow}>
              <Text style={styles.when}>
                {g.when ? g.when.toLocaleString() : "—"}  •  {g.sport}
              </Text>
              <View style={styles.teamsRow}>
                <TouchableOpacity
                  disabled={locked || g.done || eliminated}
                  onPress={() => togglePick(g.id, "home")}
                  style={[
                    styles.sideBtn,
                    pick === "home" && styles.sideSelected,
                    (locked || g.done || eliminated) && styles.sideDisabled
                  ]}
                >
                  <Text style={styles.sideTxt}>{g.home}</Text>
                </TouchableOpacity>

                <Text style={styles.vs}>vs</Text>

                <TouchableOpacity
                  disabled={locked || g.done || eliminated}
                  onPress={() => togglePick(g.id, "away")}
                  style={[
                    styles.sideBtn,
                    pick === "away" && styles.sideSelected,
                    (locked || g.done || eliminated) && styles.sideDisabled
                  ]}
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

        <TouchableOpacity
          disabled={saving || locked || eliminated}
          onPress={savePicks}
          style={[styles.saveBtn, (saving || locked || eliminated) && { opacity: 0.6 }]}
        >
          <Text style={styles.saveTxt}>
            {eliminated ? "Eliminated" : locked ? "Locked" : "Save Picks"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: RFValue(8) },
  backBtn: { flexDirection: "row", alignItems: "center", gap: RFValue(2) },
  backTxt: { color: PURPLE, fontWeight: "800" },

  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(18) },
  sub: { color: "#ccc", marginTop: RFValue(6), marginBottom: RFValue(4), fontSize: RFValue(12) },
  empty: { color: "#ddd", marginTop: RFValue(8) },

  banner: { marginTop: RFValue(8), padding: RFValue(10), borderRadius: RFValue(10), borderWidth: 1, alignItems: "center" },
  bannerText: { fontWeight: "900" },

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
});
