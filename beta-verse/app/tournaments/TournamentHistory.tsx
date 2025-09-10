// app/tournaments/TournamentHistory.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.1)";
const CARD_BG = "rgba(0,0,0,0.6)";

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
  Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY ||
  "";

// Helpers
const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIODate = (d) => `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;
const humanDate = (iso) => {
  const d = new Date(iso);
  return `${MONTHS_ABBR[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
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
  return { done: true, winner: null }; // tie/push
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

        const today = new Date().toISOString().slice(0, 10);

        // ✅ FIXED: filter related columns via foreignTable: "tournaments"
        const { data: ents, error } = await supabase
          .from("entrants")
          .select(
            "id, user_id, joined_at, status, tournaments(*), picks(game_id, selection, pick_date)"
          )
          .eq("user_id", user.id)
          .or(`day_date.lt.${today},status.in.(settled,cancelled)`, { foreignTable: "tournaments" })
          .order("joined_at", { ascending: false });

        if (error) throw error;

        // Group entries by tournament day for batched SportsDataIO fetches
        const byDate = new Map(); // dateISO -> array<entrant>
        (ents || []).forEach((e) => {
          const dayISO = e?.tournaments?.day_date;
          if (!dayISO) return;
          if (!byDate.has(dayISO)) byDate.set(dayISO, []);
          byDate.get(dayISO).push(e);
        });

        // Build map of date -> (gameId -> {done,winner})
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

        const out = (ents || []).map((e) => {
          const t = e.tournaments || {};
          const pick = Array.isArray(e.picks) && e.picks.length > 0 ? e.picks[0] : null;

          let result = "No Pick";
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

          return {
            id: String(e.id),
            name: nameFor(t),
            entryFee: t.entry_fee,
            dateISO: t.day_date,
            dateHuman: t.day_date ? humanDate(t.day_date) : "—",
            tourStatus: t.status,
            result,
          };
        });

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
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
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
              <Text style={styles.back}>{`← Back`}</Text>
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
    case "WIN":
      return { backgroundColor: "rgba(0,255,170,0.15)", borderColor: "rgba(0,255,170,0.35)" };
    case "LOSS":
      return { backgroundColor: "rgba(255,80,80,0.15)", borderColor: "rgba(255,80,80,0.35)" };
    case "PUSH/VOID":
      return { backgroundColor: "rgba(255,215,0,0.15)", borderColor: "rgba(255,215,0,0.35)" };
    case "PENDING":
      return { backgroundColor: "rgba(97,61,193,0.18)", borderColor: "rgba(97,61,193,0.4)" };
    default:
      return { backgroundColor: "rgba(255,255,255,0.12)", borderColor: BORDER };
  }
}
function pillStyleForStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "settled") return { backgroundColor: "rgba(0,255,170,0.15)", borderColor: "rgba(0,255,170,0.35)" };
  if (s === "running") return { backgroundColor: "rgba(97,61,193,0.18)", borderColor: "rgba(97,61,193,0.4)" };
  if (s === "cancelled") return { backgroundColor: "rgba(255,80,80,0.15)", borderColor: "rgba(255,80,80,0.35)" };
  return { backgroundColor: "rgba(255,255,255,0.12)", borderColor: BORDER };
}

/* --- Styles --- */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0d0013" },
  back: {
    marginTop: RFValue(8),
    marginBottom: RFValue(10),
    color: PURPLE,
    fontWeight: "700",
    fontSize: RFValue(16),
  },
  title: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(22),
    marginBottom: RFValue(10),
  },
  card: {
    backgroundColor: CARD_BG,
    padding: RFValue(16),
    borderRadius: RFValue(16),
    borderColor: BORDER,
    borderWidth: 1,
  },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginBottom: RFValue(8) },
  line: { color: "#ddd", fontSize: RFValue(12) },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: RFValue(4),
  },
  price: { color: GOLD, fontWeight: "800" },
  pill: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    borderWidth: 1,
  },
  pillTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: RFValue(11),
    letterSpacing: 0.2,
  },
});
