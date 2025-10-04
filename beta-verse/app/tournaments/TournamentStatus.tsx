// app/tournaments/TournamentStatus.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, FlatList, Animated, Easing, Dimensions
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/* ---------------- Keys / Config ---------------- */
const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  (Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY) || "";

/* ESPN (free) sport slugs */
const ESPN = { NBA: "nba", MLB: "mlb", NHL: "nhl", WNBA: "wnba" };

/* SDIO for NFL (optional by key) */
const SDIO = {
  nfl:  { base: "https://api.sportsdata.io/v3/nfl/scores/json",  byDate: "ScoresByDate" },
  mlb:  { base: "https://api.sportsdata.io/v3/mlb/scores/json",  byDate: "GamesByDate" },
  nba:  { base: "https://api.sportsdata.io/v3/nba/scores/json",  byDate: "GamesByDate" },
  nhl:  { base: "https://api.sportsdata.io/v3/nhl/scores/json",  byDate: "GamesByDate" },
  wnba: { base: "https://api.sportsdata.io/v3/wnba/scores/json", byDate: "GamesByDate" },
};

const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const toSDIODate = (d) => `${d.getFullYear()}-${MONTHS_ABBR[d.getMonth()]}-${String(d.getDate()).padStart(2,"0")}`;

const nameFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

/* ---------- status helpers (same UX) ---------- */
const ms = (v) => (v ? new Date(v).getTime() : null);

/** Returns {uiStatus, canPick, openMs, closeMs} */
function computeUiStatus(t) {
  const now = Date.now();
  const openMs  = ms(t?.join_open_at);
  let closeMs   = ms(t?.join_close_at);
  const startMs = ms(t?.start_at);
  const endMs   = ms(t?.end_at);

  if (!closeMs && startMs) closeMs = startMs - 30 * 60 * 1000;

  const status = String(t?.status || "").toLowerCase();

  if (status === "settled" || (endMs && now >= endMs)) {
    return { uiStatus: "Settled", canPick: false, openMs, closeMs };
  }
  if (status === "running" || (startMs && now >= startMs && (!endMs || now < endMs))) {
    return { uiStatus: "Running", canPick: false, openMs, closeMs };
  }
  if (openMs && now < openMs) {
    return { uiStatus: "Opens Soon", canPick: false, openMs, closeMs };
  }
  if (closeMs && now >= closeMs) {
    return { uiStatus: "Closed", canPick: false, openMs, closeMs };
  }
  if (status === "locked") {
    return { uiStatus: "Closed", canPick: false, openMs, closeMs };
  }
  return { uiStatus: "Open", canPick: true, openMs, closeMs };
}

/* ===================================================================
   SCORE INDEX (caches per day):
   - ESPN (free) for NBA/MLB/NHL/WNBA (matches your pick IDs)
   - SDIO (NFL only; optional key)
=================================================================== */
const scoreCache = new Map(); // dayISO -> { [eventId]: { done, winner } }

const toDayISO = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};

async function fetchESPNDay(sportSlug, dayISO) {
  const yyyymmdd = dayISO.replace(/-/g, "");
  const url = `https://site.api.espn.com/apis/v2/sports/${sportSlug}/${sportSlug}/scoreboard?dates=${yyyymmdd}`;
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  return Array.isArray(j?.events) ? j.events : [];
}

function parseESPNOutcome(ev) {
  const c = ev?.competitions?.[0];
  const hc = c?.competitors?.find((t) => t?.homeAway === "home");
  const ac = c?.competitors?.find((t) => t?.homeAway === "away");
  const hs = hc?.score != null ? Number(hc.score) : null;
  const as = ac?.score != null ? Number(ac.score) : null;
  const state = (ev?.status?.type?.state || "").toLowerCase(); // 'pre'|'in'|'post'
  const done = state === "post";
  let winner = null;
  if (done && hs != null && as != null) {
    winner = hs > as ? "home" : as > hs ? "away" : null;
  }
  return { id: String(ev?.id || c?.id), done, winner };
}

async function fetchNFL_SDIO(dayISO) {
  if (!SDIO_KEY) return [];
  const sdioDate = toSDIODate(new Date(dayISO));
  const url = `${SDIO.nfl.base}/${SDIO.nfl.byDate}/${encodeURIComponent(sdioDate)}?key=${encodeURIComponent(SDIO_KEY)}`;
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return [];
  const arr = await r.json().catch(() => []);
  return Array.isArray(arr) ? arr : [];
}

function parseSDIOOutcome(game) {
  const id = String(game?.GameID ?? game?.GameKey ?? `${game?.HomeTeam}-${game?.AwayTeam}-${game?.Date}`);
  const st = String(game?.Status || "").toLowerCase();
  const done = st.includes("final") || st.startsWith("f/");
  const hs = game?.HomeTeamScore ?? game?.HomeScore ?? game?.HomeTeamRuns ?? game?.HomeTeamGoals ?? null;
  const as = game?.AwayTeamScore ?? game?.AwayScore ?? game?.AwayTeamRuns ?? game?.AwayTeamGoals ?? null;
  let winner = null;
  if (done && hs != null && as != null) {
    winner = hs > as ? "home" : as > hs ? "away" : null;
  }
  return { id, done, winner };
}

async function buildScoreIndex(dayISO) {
  if (scoreCache.has(dayISO)) return scoreCache.get(dayISO);
  const index = {};

  const [nba, mlb, nhl, wnba] = await Promise.all([
    fetchESPNDay(ESPN.NBA, dayISO),
    fetchESPNDay(ESPN.MLB, dayISO),
    fetchESPNDay(ESPN.NHL, dayISO),
    fetchESPNDay(ESPN.WNBA, dayISO),
  ]);
  [...nba, ...mlb, ...nhl, ...wnba].forEach((ev) => {
    const { id, done, winner } = parseESPNOutcome(ev);
    if (id) index[String(id)] = { done, winner };
  });

  const nflArr = await fetchNFL_SDIO(dayISO);
  nflArr.forEach((g) => {
    const { id, done, winner } = parseSDIOOutcome(g);
    if (id) index[String(id)] = { done, winner };
  });

  scoreCache.set(dayISO, index);
  return index;
}

async function findGameOutcome(dayDate, gameId) {
  const dayISO = toDayISO(dayDate);
  const idx = await buildScoreIndex(dayISO);
  return idx[String(gameId)] || null;
}

/* ======================= Animated Galaxy Bits ======================= */
function useTwinkleStars(count = 26) {
  const stars = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const size = Math.random() < 0.25 ? RFValue(4) : RFValue(2);
      return {
        id: i,
        x: Math.random() * SCREEN_W,
        y: Math.random() * SCREEN_H * 0.7 + RFValue(40),
        size,
        anim: new Animated.Value(Math.random() * 1),
        delay: Math.floor(Math.random() * 1800),
        dur: 1200 + Math.floor(Math.random() * 1400),
      };
    });
  }, [count]);

  useEffect(() => {
    stars.forEach((s) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(s.anim, { toValue: 0.15, duration: s.dur, delay: s.delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(s.anim, { toValue: 1, duration: s.dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    // no cleanup needed; app unmount stops anims
  }, [stars]);

  return stars;
}

function GalaxyOverlay() {
  const drift = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [drift]);

  const translateY = drift.interpolate({ inputRange: [0,1], outputRange: [0, -RFValue(18)] });
  const stars = useTwinkleStars(28);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* soft aurora sweep */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
        <LinearGradient
          colors={["rgba(97,61,193,0.20)", "rgba(255,215,0,0.08)", "rgba(44,7,53,0.18)"]}
          start={{ x: 0.1, y: 0.0 }} end={{ x: 0.9, y: 1.0 }}
          style={{ width: "120%", height: "115%", position: "absolute", top: -RFValue(60), left: -RFValue(20) }}
        />
      </Animated.View>

      {/* twinkling points */}
      {stars.map((s) => (
        <Animated.View
          key={s.id}
          style={{
            position: "absolute",
            left: s.x, top: s.y,
            width: s.size, height: s.size,
            borderRadius: 999,
            backgroundColor: "#fff",
            opacity: s.anim,
            shadowColor: "#fff",
            shadowOpacity: 0.8,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      ))}
    </View>
  );
}

/* ===================================================================
   Screen
=================================================================== */
export default function TournamentStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // your entrants + tournaments (latest first)
        const { data: entries, error } = await supabase
          .from("entrants")
          .select("id, user_id, status, joined_at, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;

        const enriched = [];
        for (const e of entries || []) {
          const t = e.tournaments || {};
          const ui = computeUiStatus(t);

          // include result so manual grading shows instantly
          const { data: p } = await supabase
            .from("picks")
            .select("game_id, selection, result")
            .eq("tournament_id", t.id)
            .eq("user_id", e.user_id)
            .eq("day_date", t.day_date)
            .maybeSingle();

          // pillar counts
          let correct = 0, wrong = 0, pending = 0;

          // banner eliminated (from entrants row)
          let eliminated = String(e.status || "").toLowerCase() === "eliminated";

          if (p) {
            // 1) Prefer DB grading if present
            if (p.result === "win") {
              correct = 1;
            } else if (p.result === "loss") {
              wrong = 1;
              eliminated = true; // keep consistent with DB elimination trigger / manual flip
            } else {
              // 2) No DB grade yet → external scoreboards
              const outcome = p.game_id ? await findGameOutcome(new Date(t.day_date), p.game_id) : null;
              if (outcome) {
                if (!outcome.done) pending = 1;
                else if (outcome.winner === p.selection) correct = 1;
                else if (outcome.winner && outcome.winner !== p.selection) { wrong = 1; eliminated = true; }
              } else {
                // unknown → pending only while pick window open
                pending = ui.canPick ? 1 : 0;
              }
            }
          } else {
            // no pick yet → pending only while window open
            pending = ui.canPick ? 1 : 0;
          }

          // 🔒 OVERRIDE: if entrant is already eliminated, never show Pending.
          // If nothing marked wrong/correct yet, show Wrong = 1 (explains elimination).
          if (eliminated) {
            if (correct === 0 && wrong === 0) wrong = 1;
            pending = 0;
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
    if (!canPick) return; // block when locked/closed
    router.push({ pathname: "/entries/[entryId]", params: { entryId: String(id) } });
  }, [router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      {/* animated galaxy overlay */}
      <GalaxyOverlay />

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
            {/* subtle animated border gloss */}
            <LinearGradient
              colors={["rgba(255,215,0,0.25)","rgba(97,61,193,0.15)","rgba(44,7,53,0.25)"]}
              start={{x:0,y:0}} end={{x:1,y:1}}
              style={styles.cardGradient}
            />

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

/* ---------- UI bits ---------- */
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
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
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
