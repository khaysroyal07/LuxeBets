// app/tournaments/TournamentStatus.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, FlatList
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";

/* SportsDataIO (to show pick outcome) */
const SPORT_CFG = {
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  gamesByDate: "ScoresByDate" },
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  gamesByDate: "GamesByDate" },
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  gamesByDate: "GamesByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  gamesByDate: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", gamesByDate: "GamesByDate" },
};
const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY || "";

const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIODate = (d) => `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;

const nameFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

export default function TournamentStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // Your entrants + tournaments (latest first)
        const { data: entries, error } = await supabase
          .from("entrants")
          .select("id, user_id, status, joined_at, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const enriched = [];
        for (const e of entries || []) {
          const t = e.tournaments;

          // Your pick for that tourney/day
          const { data: p, error: pErr } = await supabase
            .from("picks")
            .select("game_id, selection")
            .eq("tournament_id", t.id)
            .eq("user_id", e.user_id)
            .eq("day_date", t.day_date)
            .limit(1)
            .maybeSingle();
          if (pErr) throw pErr;

          let correct = 0, wrong = 0, pending = 1;
          let eliminated = String(e.status || "").toLowerCase() === "eliminated";
          const statusStr = (Date.now() >= new Date(t.join_close_at).getTime()) ? "Locked" : "Open";

          if (p?.game_id) {
            const res = await findGameForId(new Date(t.day_date), p.game_id);
            if (res) {
              if (res.done) {
                pending = 0;
                if (res.winner === p.selection) { correct = 1; wrong = 0; }
                else if (res.winner && res.winner !== p.selection) { wrong = 1; eliminated = true; }
              } else {
                pending = 1;
              }
            }
          }

          enriched.push({
            entryId: e.id,
            name: nameFor(t),
            closes: t.join_close_at ? new Date(t.join_close_at).toLocaleString() : "—",
            status: statusStr,
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

  const goManage = useCallback((id) => {
    // More robust navigation prevents the brief crash/flash if params parsing ever hiccups
    router.push({ pathname: "/entries/[entryId]", params: { entryId: String(id) } });
  }, [router]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={cards}
        keyExtractor={(it) => String(it.entryId)}
        ListHeaderComponent={
          <View style={{ marginBottom: RFValue(12) }}>
            <TouchableOpacity onPress={() => router.push("../(tabs)/tournaments")}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Your Tournament Status</Text>
            {cards.length === 0 && <Text style={styles.empty}>No active entries.</Text>}
          </View>
        }
        renderItem={({ item: c }) => (
          <View style={styles.card}>
            {/* Header */}
            <Text
              style={styles.name}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {c.name} • ANY
            </Text>

            {/* Meta line (wraps nicely on small screens) */}
            <Text style={styles.sub} numberOfLines={2}>
              <Text>Closes: </Text>
              <Text style={styles.subStrong}>{c.closes}</Text>
              <Text>  •  Status: </Text>
              <Text style={[styles.subStrong, { color: GOLD }]}>{c.status}</Text>
            </Text>

            {/* Pills */}
            <View style={styles.pills}>
              <Pill color="#22c55e" label="Correct" value={c.correct} />
              <Pill color="#f59e0b" label="Pending" value={c.pending} />
              <Pill color="#ef4444" label="Wrong" value={c.wrong} />
            </View>

            {/* Banner */}
            <View
              style={[
                styles.banner,
                c.eliminated
                  ? { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }
                  : { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" },
              ]}
            >
              <Text
                style={[
                  styles.bannerText,
                  { color: c.eliminated ? "#ef4444" : "#22c55e" },
                ]}
                numberOfLines={1}
              >
                {c.eliminated ? "Eliminated" : "Still Alive"}
              </Text>
            </View>

            {/* Manage */}
            <TouchableOpacity onPress={() => goManage(c.entryId)} style={styles.manageBtn}>
              <Text style={styles.manageTxt}>Manage Pick</Text>
            </TouchableOpacity>
          </View>
        )}
        removeClippedSubviews
        initialNumToRender={6}
        windowSize={5}
      />
    </ImageBackground>
  );
}

async function findGameForId(dayDate, gameId) {
  if (!SDIO_KEY) return null;
  const sdioDate = toSDIODate(dayDate);

  const lists = await Promise.all(
    Object.values(SPORT_CFG).map(async (cfg) => {
      const url = `${cfg.base}/${cfg.gamesByDate}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
      const resp = await fetch(url).catch(() => null);
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

function Pill({ color, label, value }) {
  return (
    <View style={[pillStyles.pill, { borderColor: color, backgroundColor: "rgba(255,255,255,0.05)" }]}>
      <Text style={[pillStyles.val, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={pillStyles.lab} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ===== styles (keeps your vibe; clamps text and reduces overflow) ===== */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: PURPLE, fontWeight: "700", fontSize: RFValue(16), marginTop: RFValue(50), marginBottom: RFValue(20) },
  title: { fontSize: RFValue(22), fontWeight: "900", color: "#fff", marginBottom: RFValue(6) },
  empty: { color: "#ddd", marginTop: RFValue(8) },

  card: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: RFValue(16),
    padding: RFValue(14),
    marginBottom: RFValue(12),
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    overflow: "hidden",
  },
  name: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(16),
    marginBottom: RFValue(4),
  },
  sub: {
    color: "#ccc",
    fontSize: RFValue(12),
    lineHeight: RFValue(16),
    flexWrap: "wrap",
  },
  subStrong: { color: "#eee", fontWeight: "700" },

  pills: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(10) },
  banner: { marginTop: RFValue(10), padding: RFValue(10), borderRadius: RFValue(10), borderWidth: 1, alignItems: "center" },
  bannerText: { fontWeight: "900" },

  manageBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), alignItems: "center", marginTop: RFValue(12) },
  manageTxt: { color: "#fff", fontWeight: "900" },
});

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: "column",
    alignItems: "center",
    borderRadius: RFValue(10),
    borderWidth: 1,
    paddingVertical: RFValue(8),
    paddingHorizontal: RFValue(10),
    minWidth: RFValue(84),
  },
  val: { fontSize: RFValue(16), fontWeight: "900" },
  lab: { color: "#ddd", fontSize: RFValue(11), marginTop: RFValue(2) },
});
