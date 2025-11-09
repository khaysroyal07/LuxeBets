import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, FlatList, Animated, Easing, Dimensions
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";
const CYAN   = "#46E8FF";
const PINK   = "#FF79C6";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/* ---------------- helpers that only use your current schema ---------------- */
const pad = (n: number) => String(n).padStart(2, "0");
const toISO_UTC = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function addDaysUTC(src: Date, days: number) {
  const d = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
/** If Tue–Thu → this window; Fri–Sat → next Tue–Thu; Sun–Mon → upcoming Tue–Thu (UTC) */
function currentTueThuWindowUTC(today = new Date()) {
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  let start;
  if (dow >= 2 && dow <= 4) start = addDaysUTC(today, -(dow - 2));
  else if (dow === 0 || dow === 1) start = addDaysUTC(today, 2 - dow);
  else start = addDaysUTC(today, 9 - dow); // Fri/Sat → next Tue
  const end = addDaysUTC(start, 2);
  return { startISO: toISO_UTC(start), endISO: toISO_UTC(end) };
}

const nameFor = (t: any) => t?.title || (t?.entry_fee_cents ? `Tournament $${t.entry_fee_cents/100}` : "Tournament");

function computeUiStatusFromDates(t: any) {
  const now = Date.now();
  const startMs = t?.start_date ? new Date(`${t.start_date}T00:00:00Z`).getTime() : null;
  const endMs   = t?.end_date   ? new Date(`${t.end_date}T23:59:59Z`).getTime()   : null;

  if (endMs && now > endMs)        return { uiStatus: "Settled", canPick: false };
  if (startMs && now >= startMs && (!endMs || now <= endMs)) return { uiStatus: "Running", canPick: false };
  if (startMs && now < startMs)    return { uiStatus: "Open",    canPick: true  };
  return { uiStatus: "Open", canPick: true };
}

/* ======================= simple background stars (visual only) ======================= */
function useTwinkleStars(count = 26, yMinPct = 0.15, yMaxPct = 0.85) {
  const stars = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const size = Math.random() < 0.22 ? RFValue(4) : RFValue(2);
      return {
        id: i,
        x: Math.random() * SCREEN_W,
        y: SCREEN_H * (yMinPct + Math.random() * (yMaxPct - yMinPct)),
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
  }, [stars]);

  return stars;
}

function GalaxyOverlay() {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [drift]);

  const translateY = drift.interpolate({ inputRange: [0,1], outputRange: [0, -RFValue(22)] });

  const starsNear = useTwinkleStars(22, 0.18, 0.75);
  const starsFar  = useTwinkleStars(18, 0.05, 0.95);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
        <LinearGradient
          colors={["rgba(97,61,193,0.22)", "rgba(255,215,0,0.08)", "rgba(70,232,255,0.12)"]}
          start={{ x: 0.05, y: 0.0 }} end={{ x: 0.95, y: 1.0 }}
          style={{ width: "125%", height: "120%", position: "absolute", top: -RFValue(70), left: -RFValue(24) }}
        />
      </Animated.View>
      {starsFar.map((s) => (
        <Animated.View
          key={`far-${s.id}`}
          style={{
            position: "absolute",
            left: s.x, top: s.y,
            width: s.size, height: s.size,
            borderRadius: 999,
            backgroundColor: "#fff",
            opacity: Animated.multiply(s.anim, 0.65),
          }}
        />
      ))}
      {starsNear.map((s) => (
        <Animated.View
          key={`near-${s.id}`}
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
  const [cards, setCards] = useState<any[]>([]);
  const [filter, setFilter] = useState<"current"|"past"|"all">("current");

  const weekLabel = useMemo(() => {
    const { startISO, endISO } = currentTueThuWindowUTC(new Date());
    const s = new Date(startISO + "T00:00:00Z");
    const e = new Date(endISO + "T00:00:00Z");
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(s)} – ${fmt(e)}`;
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) { setCards([]); setLoading(false); return; }

      // 1) my entries
      const { data: entries, error: eErr } = await supabase
        .from("entries")
        .select("id, user_id, tournament_id, status, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (eErr) throw eErr;

      const tIds = Array.from(new Set((entries || []).map((e: any) => e.tournament_id)));
      if (tIds.length === 0) { setCards([]); setLoading(false); return; }

      // 2) tournaments (new schema)
      const { data: tours, error: tErr } = await supabase
        .from("tournaments")
        .select("id, title, entry_fee_cents, start_date, end_date")
        .in("id", tIds);
      if (tErr) throw tErr;

      const tById = new Map<string, any>();
      (tours || []).forEach((t: any) => tById.set(String(t.id), t));

      // 3) enrich w/ one pick for the tournament day (by created_at day window)
      const rows: any[] = [];
      for (const e of entries || []) {
        const t = tById.get(String(e.tournament_id));
        if (!t) continue;

        const ui = computeUiStatusFromDates(t);
        const dayISO = String(t.start_date || t.day_date || ""); // prefer start_date

        // derive window bounds in UTC for that day
        const from = dayISO ? `${dayISO}T00:00:00Z` : undefined;
        const to   = dayISO ? `${dayISO}T23:59:59Z` : undefined;

        let pick: any = null;
        if (from && to) {
          const { data: p } = await supabase
            .from("picks")
            .select("game_id, selection, result, created_at")
            .eq("entry_id", e.id)
            .gte("created_at", from)
            .lte("created_at", to)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          pick = p || null;
        }

        let correct = 0, wrong = 0, pending = 0;
        let eliminated = String(e.status || "").toLowerCase() === "eliminated";

        if (pick) {
          const res = String(pick.result || "pending").toLowerCase();
          if (res === "win") correct = 1;
          else if (res === "loss") { wrong = 1; eliminated = true; }
          else pending = ui.canPick ? 1 : 0;
        } else {
          pending = ui.canPick ? 1 : 0;
        }

        rows.push({
          entryId: e.id,
          name: nameFor(t),
          day_date: dayISO,
          uiStatus: ui.uiStatus,
          canPick: ui.canPick,
          correct, wrong, pending,
          eliminated,
          opens: dayISO ? new Date(`${dayISO}T00:00:00Z`).toLocaleString() : "—",
          closes: t?.end_date ? new Date(`${t.end_date}T23:59:59Z`).toLocaleString() : "—",
        });
      }

      // filter
      const { startISO, endISO } = currentTueThuWindowUTC(new Date());
      const filtered = rows.filter((r) => {
        const day = r.day_date || "";
        if (filter === "current") return day >= startISO && day <= endISO;
        if (filter === "past")    return day < startISO;
        return true;
      });

      setCards(filtered);
    } catch (e) {
      console.warn(e);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const goManage = useCallback((id: string, canPick: boolean) => {
    if (!canPick) return;
    // Manage by entry id
    router.push({ pathname: "/entries/[entryId]", params: { entryId: String(id) } });
  }, [router]);

  const headerShine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerShine, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(headerShine, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [headerShine]);
  const shineTranslate = headerShine.interpolate({ inputRange: [0,1], outputRange: [-40, 40] });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <GalaxyOverlay />

      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(60) }}
        data={cards}
        keyExtractor={(it) => String(it.entryId)}
        ListHeaderComponent={
          <View style={headerStyles.wrap}>
            <TouchableOpacity onPress={() => router.push("../(tabs)/tournaments")}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>

            <View style={headerStyles.glass}>
              <LinearGradient
                colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)"]}
                start={{x:0,y:0}} end={{x:1,y:1}}
                style={StyleSheet.absoluteFill}
              />
              <Text style={headerStyles.title}>Your Tournament Status</Text>
              <Text style={headerStyles.sub}>
                Current window: <Text style={{ color: GOLD, fontWeight: "900" }}>{weekLabel}</Text>
              </Text>

              <View style={chipStyles.row}>
                <Chip active={filter === "current"} label="Current" onPress={() => setFilter("current")} />
                <Chip active={filter === "past"}    label="Past (Joined)" onPress={() => setFilter("past")} />
                <Chip active={filter === "all"}     label="All" onPress={() => setFilter("all")} />
                <TouchableOpacity onPress={fetchRows} style={chipStyles.refreshBtn}>
                  <Text style={chipStyles.refreshTxt}>⟳ Refresh</Text>
                </TouchableOpacity>
              </View>

              <View style={headerStyles.divider}>
                <Animated.View style={[headerStyles.shine, { transform: [{ translateX: shineTranslate }] }]} />
              </View>
            </View>

            {cards.length === 0 && <Text style={styles.empty}>No entries for this filter.</Text>}
          </View>
        }
        renderItem={({ item: c }) => (
          <Card
            name={`${c.name} • ANY`}
            opens={c.opens}
            closes={c.closes}
            uiStatus={c.uiStatus}
            correct={c.correct}
            pending={c.pending}
            wrong={c.wrong}
            eliminated={c.eliminated}
            canPick={c.canPick}
            onManage={() => goManage(c.entryId, c.canPick)}
          />
        )}
        removeClippedSubviews
        initialNumToRender={6}
        windowSize={6}
      />
    </ImageBackground>
  );
}

/* ---------- Card & small UI bits (unchanged look) ---------- */
function Card({ name, opens, closes, uiStatus, correct, pending, wrong, eliminated, canPick, onManage }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  const shimmerTranslate = shimmer.interpolate({ inputRange: [0,1], outputRange: [-80, 80] });
  const statusColor =
    uiStatus === "Open" ? GOLD :
    uiStatus === "Running" ? "#4ADE80" :
    uiStatus === "Settled" ? "#22c55e" :
    uiStatus === "Closed" ? "#f59e0b" : "#a1a1aa";

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["rgba(97,61,193,0.45)","rgba(255,215,0,0.22)","rgba(70,232,255,0.28)"]}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={styles.cardGradient}
      />
      <Animated.View pointerEvents="none"
        style={[
          styles.shimmerStripe,
          { transform: [{ translateX: shimmerTranslate }, { rotate: "-18deg" }] }
        ]}
      />
      <View style={[styles.ribbon, { borderColor: statusColor }]}>
        <Text style={[styles.ribbonTxt, { color: statusColor }]} numberOfLines={1}>
          {uiStatus}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
      <Text style={styles.sub} numberOfLines={3}>
        <Text>Opens: </Text><Text style={styles.subStrong}>{opens}</Text>
        <Text>  •  Closes: </Text><Text style={styles.subStrong}>{closes}</Text>
        <Text>  •  Status: </Text><Text style={[styles.subStrong, { color: statusColor }]}>{uiStatus}</Text>
      </Text>
      <View style={styles.pills}>
        <Pill color="#22c55e" label="Correct" value={correct} />
        <Pill color="#f59e0b" label="Pending" value={pending} />
        <Pill color="#ef4444" label="Wrong" value={wrong} />
      </View>
      <View
        style={[
          styles.banner,
          eliminated
            ? { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }
            : { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" },
        ]}
      >
        <Text style={[styles.bannerText, { color: eliminated ? "#ef4444" : "#22c55e" }]} numberOfLines={1}>
          {eliminated ? "Eliminated" : "Still Alive"}
        </Text>
      </View>
      <TouchableOpacity onPress={onManage} disabled={!canPick} style={[styles.manageBtn, !canPick && { backgroundColor: "#555" }]}>
        <Text style={styles.manageTxt}>{canPick ? "Make / Manage Pick" : "Pick Locked"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Pill({ color, label, value }) {
  return (
    <View style={[pillStyles.pill, { borderColor: color, backgroundColor: "rgba(255,255,255,0.05)" }]}>
      <Text style={[pillStyles.val, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={pillStyles.lab} numberOfLines={1}>{label}</Text>
    </View>
  );
}
function Chip({ active, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <LinearGradient
        colors={active ? [PURPLE, "#7A68E9"] : ["rgba(0,0,0,0.45)", "rgba(0,0,0,0.35)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[chipStyles.chip, active && chipStyles.chipActive]}
      >
        <Text style={[chipStyles.chipTxt, active && chipStyles.chipTxtActive]} numberOfLines={1}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: PURPLE, fontWeight: "700", fontSize: RFValue(16), marginTop: RFValue(20), marginBottom: RFValue(16) },

  card: {
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: RFValue(18),
    padding: RFValue(16),
    marginBottom: RFValue(14),
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardGradient: { ...StyleSheet.absoluteFillObject, opacity: 0.30 },
  shimmerStripe: {
    position: "absolute",
    top: -RFValue(50),
    left: -RFValue(80),
    width: RFValue(160),
    height: RFValue(160),
    borderRadius: RFValue(12),
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ribbon: { position: "absolute", right: RFValue(12), top: RFValue(12), paddingVertical: RFValue(4), paddingHorizontal: RFValue(10), borderRadius: RFValue(10), borderWidth: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  ribbonTxt: { fontWeight: "900", fontSize: RFValue(10), letterSpacing: 0.5 },

  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(17), marginBottom: RFValue(6) },
  sub: { color: "#ccc", fontSize: RFValue(12), lineHeight: RFValue(16), flexWrap: "wrap" },
  subStrong: { color: "#eee", fontWeight: "700" },

  pills: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(10) },
  banner: { marginTop: RFValue(12), padding: RFValue(10), borderRadius: RFValue(12), borderWidth: 1, alignItems: "center" },
  bannerText: { fontWeight: "900", fontSize: RFValue(12) },

  manageBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), alignItems: "center", marginTop: RFValue(12), shadowColor: PURPLE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  manageTxt: { color: "#fff", fontWeight: "900" },

  empty: { color: "#ddd", marginTop: RFValue(10) },
});

const pillStyles = StyleSheet.create({
  pill: { flexDirection: "column", alignItems: "center", borderRadius: RFValue(12), borderWidth: 1, paddingVertical: RFValue(8), paddingHorizontal: RFValue(10), minWidth: RFValue(88) },
  val: { fontSize: RFValue(16), fontWeight: "900" },
  lab: { color: "#ddd", fontSize: RFValue(11), marginTop: RFValue(2) },
});

const chipStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: RFValue(8), marginTop: RFValue(8), flexWrap: "wrap" },
  chip: { paddingVertical: RFValue(6), paddingHorizontal: RFValue(12), borderRadius: RFValue(999), borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  chipActive: { borderColor: "rgba(255,255,255,0.28)", shadowColor: PURPLE, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  chipTxt: { color: "#ddd", fontWeight: "800", fontSize: RFValue(12), letterSpacing: 0.2 },
  chipTxtActive: { color: "#fff" },
  refreshBtn: { paddingVertical: RFValue(6), paddingHorizontal: RFValue(12), borderRadius: RFValue(999), backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  refreshTxt: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },
});

const headerStyles = StyleSheet.create({
  wrap: { marginBottom: RFValue(12) },
  glass: { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: RFValue(16), padding: RFValue(14), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: RFValue(22), fontWeight: "900", color: "#fff", marginBottom: RFValue(4) },
  sub: { color: "#ddd", fontSize: RFValue(12) },
  divider: { height: RFValue(2), marginTop: RFValue(12), borderRadius: RFValue(2), overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" },
  shine: { width: RFValue(80), height: RFValue(2), borderRadius: RFValue(2), backgroundColor: "rgba(255,255,255,0.36)" },
});
