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

// ---- window + status helpers ----
function ms(v) { return v ? new Date(v).getTime() : null; }

/** Returns {uiStatus, canPick, openMs, closeMs} */
function computeUiStatus(t) {
  const now = Date.now();
  const openMs  = ms(t?.join_open_at);
  let closeMs   = ms(t?.join_close_at);
  const startMs = ms(t?.start_at);
  const endMs   = ms(t?.end_at);

  // derive close if missing
  if (!closeMs && startMs) closeMs = startMs - 30 * 60 * 1000;

  const status = String(t?.status || "").toLowerCase();

  // settled beats everything
  if (status === "settled" || (endMs && now >= endMs)) {
    return { uiStatus: "Settled", canPick: false, openMs, closeMs };
  }

  // running if past start (even if close/open inconsistent)
  if (status === "running" || (startMs && now >= startMs && (!endMs || now < endMs))) {
    return { uiStatus: "Running", canPick: false, openMs, closeMs };
  }

  // pick window logic
  if (openMs && now < openMs) {
    return { uiStatus: "Opens Soon", canPick: false, openMs, closeMs };
  }
  if (closeMs && now >= closeMs) {
    return { uiStatus: "Closed", canPick: false, openMs, closeMs };
  }

  // explicit locked from server also means closed
  if (status === "locked") {
    return { uiStatus: "Closed", canPick: false, openMs, closeMs };
  }

  // if we have an open time already passed, or no times at all -> treat as open
  return { uiStatus: "Open", canPick: true, openMs, closeMs };
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

        // Your entrants + tournaments (latest first)
        const { data: entries, error } = await supabase
          .from("entrants")
          .select("id, user_id, status, joined_at, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const enriched = [];
        for (const e of entries || []) {
          const t = e.tournaments || {};
          const ui = computeUiStatus(t);

          // Your pick for that tourney/day
          const { data: p } = await supabase
            .from("picks")
            .select("game_id, selection")
            .eq("tournament_id", t.id)
            .eq("user_id", e.user_id)
            .eq("day_date", t.day_date)
            .maybeSingle();

          // outcome counters
          let correct = 0, wrong = 0, pending = 0;
          let eliminated = String(e.status || "").toLowerCase() === "eliminated";

          if (p?.game_id) {
            const res = await findGameForId(new Date(t.day_date), p.game_id);
            if (res) {
              if (res.done) {
                if (res.winner === p.selection) { correct = 1; }
                else if (res.winner && res.winner !== p.selection) { wrong = 1; eliminated = true; }
                else { /* push/void; show neither */ }
              } else {
                pending = 1;
              }
            } else {
              // no external data, treat unknown as pending only if canPick (i.e., pre-lock)
              pending = ui.canPick ? 1 : 0;
            }
          } else {
            // no pick yet → pending only while pick window is open
            pending = ui.canPick ? 1 : 0;
          }

          enriched.push({
            entryId: e.id,
            name: nameFor(t),
            opens: ui.openMs ? new Date(ui.openMs).toLocaleString() : "—",
            closes: ui.closeMs ? new Date(ui.closeMs).toLocaleString() : "—",
            uiStatus: ui.uiStatus,     // Open | Opens Soon | Closed | Running | Settled
            canPick: ui.canPick,
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

  const goManage = useCallback((id, canPick) => {
    if (!canPick) return; // block navigation when locked/closed
    router.push({ pathname: "/entries/[entryId]", params: { entryId: String(id) } });
  }, [router]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;

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
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {c.name} • ANY
            </Text>

            {/* Meta line */}
            <Text style={styles.sub} numberOfLines={3}>
              <Text>Opens: </Text>
              <Text style={styles.subStrong}>{c.opens}</Text>
              <Text>  •  Closes: </Text>
              <Text style={styles.subStrong}>{c.closes}</Text>
              <Text>  •  Status: </Text>
              <Text
                style={[
                  styles.subStrong,
                  c.uiStatus === "Open" ? { color: GOLD }
                  : c.uiStatus === "Running" ? { color: "#4ADE80" }
                  : c.uiStatus === "Settled" ? { color: "#22c55e" }
                  : { color: "#f59e0b" }
                ]}
              >
                {c.uiStatus}
              </Text>
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
              <Text style={[styles.bannerText, { color: c.eliminated ? "#ef4444" : "#22c55e" }]} numberOfLines={1}>
                {c.eliminated ? "Eliminated" : "Still Alive"}
              </Text>
            </View>

            {/* Manage Pick (disabled if closed/running/settled) */}
            <TouchableOpacity
              onPress={() => goManage(c.entryId, c.canPick)}
              disabled={!c.canPick}
              style={[styles.manageBtn, !c.canPick && { backgroundColor: "#555" }]}
            >
              <Text style={styles.manageTxt}>{c.canPick ? "Make / Manage Pick" : "Pick Locked"}</Text>
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: PURPLE, fontWeight: "700", fontSize: RFValue(16), marginTop: RFValue(20), marginBottom: RFValue(20) },
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
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginBottom: RFValue(4) },
  sub: { color: "#ccc", fontSize: RFValue(12), lineHeight: RFValue(16), flexWrap: "wrap" },
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
