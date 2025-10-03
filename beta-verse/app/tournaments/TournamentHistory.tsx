// app/tournaments/TournamentHistory.js
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  FlatList, TouchableOpacity,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";
const BORDER = "rgba(255,255,255,0.1)";
const CARD_BG = "rgba(0,0,0,0.6)";

/* SportsDataIO (optional outcome) */
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
const humanDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${MONTHS_ABBR[d.getMonth()]} ${String(d.getDate()).padStart(2,"0")}, ${d.getFullYear()}`;
};
const nameFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

function extractGameId(g) {
  return String(
    g.GameID ?? g.GameId ?? g.GlobalGameID ?? `${g.HomeTeam}-${g.AwayTeam}-${g.DateTime || g.Day}`
  );
}
function inferWinner(g) {
  const status = String(g.Status || "").toLowerCase();
  const done = status.includes("final") || status.startsWith("f/");
  const hs = g.HomeTeamScore ?? g.HomeScore ?? g.HomeTeamRuns ?? g.HomeTeamGoals ?? null;
  const as = g.AwayTeamScore ?? g.AwayScore ?? g.AwayTeamRuns ?? g.AwayTeamGoals ?? null;
  if (!done) return { done: false, winner: null };
  if (hs == null || as == null) return { done: true, winner: null };
  if (hs > as) return { done: true, winner: "home" };
  if (as > hs) return { done: true, winner: "away" };
  return { done: true, winner: null };
}

export default function TournamentHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (alive) setRows([]); return; }

        // 1) all my entrants
        const { data: myEnts, error: eErr } = await supabase
          .from("entrants")
          .select("id, tournament_id, status, joined_at")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false });
        if (eErr) throw eErr;

        const tIds = Array.from(new Set((myEnts || []).map(e => e.tournament_id)));
        if (tIds.length === 0) { if (alive) setRows([]); return; }

        // 2) fetch only tournaments that are HISTORY
        //    (use your view if created; else fall back to table + filters)
        let historyTours = [];
        const { data: vData, error: vErr } = await supabase
          .from("v_tournaments_history")
          .select("*")
          .in("id", tIds)
          .order("day_date", { ascending: false });
        if (!vErr && vData) {
          historyTours = vData;
        } else {
          const today = new Date().toISOString().slice(0,10);
          const { data: tData, error: tErr } = await supabase
            .from("tournaments")
            .select("*")
            .in("id", tIds)
            .or(`status.in.(settled,cancelled),day_date.lt.${today},end_at.lte.${new Date().toISOString()}`)
            .order("day_date", { ascending: false });
          if (tErr) throw tErr;
          historyTours = tData || [];
        }

        if (historyTours.length === 0) { if (alive) setRows([]); return; }

        // 3) map tournamentId -> entrant row (latest by joined_at)
        const entByTid = new Map();
        for (const e of myEnts) {
          if (!entByTid.has(e.tournament_id)) entByTid.set(e.tournament_id, e);
        }

        // 4) optional: SportsDataIO resolution per date
        const byDate = new Map();
        historyTours.forEach(t => {
          const k = t.day_date;
          if (!k) return;
          if (!byDate.has(k)) byDate.set(k, true);
        });

        const dateResultMap = new Map();
        if (SDIO_KEY && byDate.size > 0) {
          for (const [dayISO] of byDate) {
            const day = new Date(dayISO);
            const sdioDate = toSDIODate(day);
            const lists = await Promise.all(
              Object.values(SPORT_CFG).map(async (cfg) => {
                const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
                const resp = await fetch(url).catch(() => null);
                if (!resp || !resp.ok) return [];
                const arr = await resp.json();
                return Array.isArray(arr) ? arr : [];
              })
            );
            const map = new Map();
            lists.flat().forEach((g) => {
              const id = extractGameId(g);
              map.set(id, inferWinner(g));
            });
            dateResultMap.set(dayISO, map);
          }
        }

        // 5) for each tournament, try to grab my pick to show outcome
        const out = [];
        for (const t of historyTours) {
          const ent = entByTid.get(t.id);
          let result = "No Pick";

          // fetch my pick for that day/tournament
          const { data: pick } = await supabase
            .from("picks")
            .select("game_id, selection")
            .eq("tournament_id", t.id)
            .eq("user_id", user.id)
            .eq("day_date", t.day_date)
            .maybeSingle();

          if (pick?.game_id) {
            const mapping = dateResultMap.get(t.day_date);
            if (mapping && mapping.has(String(pick.game_id))) {
              const r = mapping.get(String(pick.game_id));
              if (!r.done) result = "Pending";
              else if (r.winner === "home" && pick.selection === "home") result = "WIN";
              else if (r.winner === "away" && pick.selection === "away") result = "WIN";
              else if (r.winner === null) result = "PUSH/VOID";
              else result = "LOSS";
            } else {
              result = SDIO_KEY ? "Pending" : "—";
            }
          }

          out.push({
            id: String(ent?.id ?? `${t.id}`),
            name: nameFor(t),
            entryFee: t.entry_fee,
            dateISO: t.day_date,
            dateHuman: humanDate(t.day_date),
            tourStatus: t.status,
            result,
          });
        }

        if (alive) setRows(out);
      } catch (err) {
        console.warn("history error:", err);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);


  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name} • ANY</Text>

      <View style={styles.metaRow}>
        <Text style={styles.line}>
          Entry: <Text style={styles.price}>${Number(item.entryFee ?? 0).toFixed(2)}</Text>
        </Text>
        <View style={[styles.pill, pillStyleForStatus(item.tourStatus)]}>
          <Text style={styles.pillTxt}>{(item.tourStatus || "—").toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.pill, pillStyleForResult(item.result)]}>
          <Text style={styles.pillTxt}>{item.result}</Text>
        </View>
        <Text style={[styles.line, { opacity: 0.9 }]}>{item.dateHuman}</Text>
      </View>
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={rows}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Tournament History</Text>
          </View>
        }
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: RFValue(10) }} />}
        ListEmptyComponent={<Text style={{ color: "#ddd" }}>No history yet.</Text>}
      />
    </ImageBackground>
  );
}

/* --- Styling helpers --- */
function pillStyleForResult(result) {
  switch ((result || "").toUpperCase()) {
    case "WIN":       return { backgroundColor: "rgba(0,255,170,0.15)", borderColor: "rgba(0,255,170,0.35)" };
    case "LOSS":      return { backgroundColor: "rgba(255,80,80,0.15)",  borderColor: "rgba(255,80,80,0.35)" };
    case "PUSH/VOID": return { backgroundColor: "rgba(255,215,0,0.15)",  borderColor: "rgba(255,215,0,0.35)" };
    case "PENDING":   return { backgroundColor: "rgba(97,61,193,0.18)",  borderColor: "rgba(97,61,193,0.4)" };
    default:          return { backgroundColor: "rgba(255,255,255,0.12)", borderColor: BORDER };
  }
}
function pillStyleForStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "settled")   return { backgroundColor: "rgba(0,255,170,0.15)", borderColor: "rgba(0,255,170,0.35)" };
  if (s === "running")   return { backgroundColor: "rgba(97,61,193,0.18)", borderColor: "rgba(97,61,193,0.4)" };
  if (s === "cancelled") return { backgroundColor: "rgba(255,80,80,0.15)", borderColor: "rgba(255,80,80,0.35)" };
  if (s === "locked")    return { backgroundColor: "rgba(255,215,0,0.15)", borderColor: "rgba(255,215,0,0.35)" };
  return { backgroundColor: "rgba(255,255,255,0.12)", borderColor: BORDER };
}

/* --- Styles --- */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0d0013" },
  back:   { marginTop: RFValue(8), marginBottom: RFValue(10), color: PURPLE, fontWeight: "700", fontSize: RFValue(16) },
  title:  { color: "#fff", fontWeight: "900", fontSize: RFValue(22), marginBottom: RFValue(10) },
  card:   { backgroundColor: CARD_BG, padding: RFValue(16), borderRadius: RFValue(16), borderColor: BORDER, borderWidth: 1 },
  name:   { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginBottom: RFValue(8) },
  line:   { color: "#ddd", fontSize: RFValue(12) },
  metaRow:{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: RFValue(4) },
  price:  { color: GOLD, fontWeight: "800" },
  pill:   { paddingHorizontal: RFValue(10), paddingVertical: RFValue(4), borderRadius: RFValue(999), borderWidth: 1 },
  pillTxt:{ color: "#fff", fontWeight: "800", fontSize: RFValue(11), letterSpacing: 0.2 },
});
