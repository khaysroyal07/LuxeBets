// app/entries/index.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Modal, Animated, Easing, Pressable,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { planetNameForTournament } from "@/lib/tournaments";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.14)";
const DIV = "rgba(255,255,255,0.10)";
const CARD_SOLID = "#141029";

type EntryStatus = "active" | "eliminated" | "winner" | "finished";
type FilterKey = "all" | EntryStatus;

type EntryCard = {
  entrantId: string;
  tournamentId: number;
  fee: number;
  weekLabel?: string | null;
  startISO: string;
  endISO: string;
  status: EntryStatus;
  planetName: string;
};

type DayRow = {
  iso: string; label: string;
  selection: "home" | "away" | null;
  result: "WIN" | "LOSS" | "PUSH" | "PENDING" | "—";
};

export default function EntriesIndex() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<EntryCard[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Modal state
  const [open, setOpen] = useState(false);
  const [modalEntry, setModalEntry] = useState<EntryCard | null>(null);
  const [modalDays, setModalDays] = useState<DayRow[]>([]);

  // Anim
  const scale = useRef(new Animated.Value(0.92)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const animateIn = () => {
    scale.setValue(0.92); cardFade.setValue(0); backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 120, mass: 0.9, useNativeDriver: true }),
      Animated.timing(cardFade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };
  const animateOut = (cb?: () => void) => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardFade, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.96, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => cb && cb());
  };

  const includeFinished = true;

  const fetchEntries = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) { setCards([]); return; }

    const { data, error } = await supabase
      .from("entrants")
      .select(`
        id, status, joined_at, tournament_id,
        tournaments!inner(id, day_date, entry_fee, week_label, status)
      `)
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });

    if (error) throw error;

    const rows: EntryCard[] = [];
    for (const e of data || []) {
      const t = e.tournaments;
      const start = new Date(String(t.day_date));
      const end = new Date(start); end.setDate(start.getDate() + 2);

      const { planet_name } = await planetNameForTournament(t.id, t.day_date);

      let st: EntryStatus;
      if (e.status === "eliminated") st = "eliminated";
      else if (e.status === "winner") st = "winner";
      else if (t.status === "settled") st = "finished";
      else st = "active";

      rows.push({
        entrantId: String(e.id),
        tournamentId: Number(t.id),
        fee: Number(t.entry_fee),
        weekLabel: t.week_label,
        startISO: start.toISOString().slice(0, 10),
        endISO: end.toISOString().slice(0, 10),
        status: st,
        planetName: planet_name || "Tournament",
      });
    }

    const filtered = rows.filter((r) => (includeFinished ? true : r.status === "active"));
    setCards(filtered);
  }, []);

  useEffect(() => {
    let on = true;
    (async () => { try { setLoading(true); await fetchEntries(); } finally { if (on) setLoading(false); } })();
    return () => { on = false; };
  }, [fetchEntries]);

  const onRefresh = useCallback(async () => {
    try { setRefreshing(true); await fetchEntries(); } finally { setRefreshing(false); }
  }, [fetchEntries]);

  const visibleCards = useMemo(() => (filter === "all" ? cards : cards.filter(c => c.status === filter)), [cards, filter]);

  const openDetails = async (entry: EntryCard) => {
    setModalEntry(entry);
    const start = new Date(entry.startISO);
    const days: DayRow[] = [0,1,2].map(off => {
      const d = new Date(start); d.setDate(start.getDate() + off);
      const iso = d.toISOString().slice(0,10);
      const label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      return { iso, label, selection: null, result: "PENDING" };
    });

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (user) {
      const { data: picks } = await supabase
        .from("picks")
        .select("day_date, selection, result")
        .eq("user_id", user.id)
        .eq("tournament_id", entry.tournamentId)
        .in("day_date", days.map(d => d.iso));
      const map = new Map<string, { selection: "home" | "away"; result: string }>();
      (picks || []).forEach((p: any) => map.set(String(p.day_date), { selection: p.selection, result: p.result }));
      for (let i=0;i<days.length;i++) {
        const hit = map.get(days[i].iso);
        if (hit) {
          const RU = (hit.result || "pending").toUpperCase();
          days[i] = {
            ...days[i],
            selection: hit.selection,
            result: RU === "WIN" ? "WIN" : RU === "LOSS" ? "LOSS" : RU === "PUSH" ? "PUSH" : "PENDING",
          };
        }
      }
    }

    setModalDays(days);
    setOpen(true);
    requestAnimationFrame(animateIn);
  };

  const closeDetails = () => animateOut(() => setOpen(false));

  // --- timeline helpers (keep layout, adjust fill/outline rules) ---
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isPast = (iso: string) => new Date(iso) < new Date(todayISO);
  const isToday = (iso: string) => iso === todayISO;

  const renderCard = ({ item }: { item: EntryCard }) => {
    const pill = pillDef(item.status);
    return (
      <LinearGradient colors={["#1b1438","#110d28"]} style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.badge}><Ionicons name="trophy" size={RFValue(14)} color={GOLD} /></View>
          <Text style={styles.cardTitle}>{item.planetName} — ${item.fee}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.rangeLink}>{prettyRange(item.startISO, item.endISO)}</Text>
          <View style={[styles.pill, { backgroundColor: pill.bg }]}>
            <View style={[styles.dot, { backgroundColor: pill.dot }]} />
            <Text style={styles.pillText}>{pill.text}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => openDetails(item)} style={styles.detailsBtn} activeOpacity={0.85}>
          <Text style={styles.detailsTxt}>View Details</Text>
          <Ionicons name="chevron-forward" size={RFValue(14)} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>
    );
  };

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Back to Tournaments + Title */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.push("/(tabs)/tournaments")} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
          <Text style={styles.backTxt}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Current Entries</Text>
        <View style={{ width: RFValue(90) }} />
      </View>

      {/* Filter */}
      <View style={styles.filterBar}>
        {(["all","active","eliminated","winner","finished"] as FilterKey[]).map(k => {
          const active = filter === k;
          return (
            <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{k[0].toUpperCase()+k.slice(1)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PURPLE} /></View>
      ) : (
        <FlatList
          data={visibleCards}
          keyExtractor={(it) => it.entrantId}
          contentContainerStyle={{ paddingHorizontal: RFValue(14), paddingBottom: RFValue(32) }}
          ItemSeparatorComponent={() => <View style={{ height: RFValue(12) }} />}
          renderItem={renderCard}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={<View style={styles.emptyWrap}><Text style={styles.emptyText}>No entries match this filter.</Text></View>}
        />
      )}

      {/* Solid Details Modal */}
      <Modal visible={open} transparent animationType="none" onRequestClose={closeDetails}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.65)", opacity: backdrop }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDetails} />
        <View style={styles.modalWrap} pointerEvents="box-none">
          <Animated.View style={[styles.modalCard, { opacity: cardFade, transform: [{ scale }] }]}>

            <View style={styles.modalHeader}>
              <View style={styles.badge}><Ionicons name="trophy" size={RFValue(14)} color={GOLD} /></View>
              <Text style={styles.modalTitle}>{modalEntry?.planetName} — ${modalEntry?.fee}</Text>
              <TouchableOpacity onPress={closeDetails} style={styles.closeBtn}><Ionicons name="close" size={RFValue(18)} color="#fff" /></TouchableOpacity>
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.rangeLink}>{prettyRange(modalEntry?.startISO || "", modalEntry?.endISO || "", true)}</Text>
              <TouchableOpacity><Text style={styles.playerStatus}>Player Status</Text></TouchableOpacity>
            </View>

            <View style={[styles.divider, { marginTop: RFValue(10) }]} />

            {/* Timeline: same layout, updated fill/outline rules */}
            <View style={styles.timelineWrap}>
              <View style={styles.timelineLine} />
              {modalDays.map((d, idx) => {
                const pill = resultDef(d.result);

                // Determine dot visuals
                const past = isPast(d.iso);
                const today = isToday(d.iso);

                // Base dot (transparent future)
                let dotStyle: any = {
                  backgroundColor: "transparent",
                  borderColor: "rgba(255,255,255,0.25)",
                  borderWidth: 1.5,
                };

                if (past) {
                  // Past: filled gold
                  dotStyle = { backgroundColor: GOLD, borderColor: GOLD, borderWidth: 1.5 };
                } else if (today) {
                  // Today: outline gold (no fill)
                  dotStyle = { backgroundColor: "transparent", borderColor: GOLD, borderWidth: 2 };
                }

                return (
                  <View key={d.iso} style={styles.timelineItem}>
                    <View style={[styles.timelineDot, dotStyle]} />
                    <View style={styles.timelineCard}>
                      <Text style={styles.dayHeading}>{d.label}</Text>
                      <View style={styles.pickRow}>
                        {d.selection ? (
                          <>
                            <Text style={styles.teamTxt}>{d.selection === "home" ? "Home pick" : "Away pick"}</Text>
                            <View style={[styles.resBadge, { borderColor: pill.color, backgroundColor: pill.bg }]}>
                              <Text style={[styles.resBadgeTxt, { color: pill.color }]}>{pill.text}</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={[styles.makePick, { opacity: 0.65 }]}>Make Your Selection</Text>
                        )}
                      </View>
                      {idx !== modalDays.length - 1 && <View style={styles.hrThin} />}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => router.push(`/entries/${modalEntry?.entrantId}`)} style={styles.primaryBtn}>
                <Text style={styles.primaryTxt}>Manage Picks</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeDetails} style={styles.secondaryBtn}>
                <Text style={styles.secondaryTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

/* utils */
function prettyRange(startISO: string, endISO: string, _u=false) {
  if (!startISO || !endISO) return "";
  const s = new Date(startISO), e = new Date(endISO);
  return `${s.toLocaleDateString(undefined,{month:"long",day:"numeric"})} - ${e.toLocaleDateString(undefined,{day:"numeric"})}`;
}
function pillDef(status: EntryStatus) {
  switch (status) {
    case "active": return { text: "Active", dot: "#22e58b", bg: "rgba(34,229,139,0.14)" };
    case "eliminated": return { text: "Eliminated", dot: "#ff5e5e", bg: "rgba(255,94,94,0.16)" };
    case "winner": return { text: "Winner", dot: GOLD, bg: "rgba(255,215,0,0.18)" };
    default: return { text: "Finished", dot: "#9d7cff", bg: "rgba(157,124,255,0.18)" };
  }
}
function resultDef(r: DayRow["result"]) {
  switch (r) {
    case "WIN": return { text: "WON", color: "#28e3a4", bg: "rgba(40,227,164,0.12)" };
    case "LOSS": return { text: "LOST", color: "#ff6b6b", bg: "rgba(255,107,107,0.12)" };
    case "PUSH": return { text: "PUSH", color: GOLD, bg: "rgba(255,215,0,0.14)" };
    case "PENDING": return { text: "Pending…", color: "#c9baff", bg: "rgba(201,186,255,0.12)" };
    default: return { text: "—", color: "#fff", bg: "transparent" };
  }
}

/* styles (your original look; only timeline dot fill changed) */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0d0013" },
  topBar: {flexDirection:'row', columnGap: RFValue(8), paddingTop: RFValue(50), paddingBottom: RFValue(8), alignItems: "center", justifyContent: "center" },
  backBtn: {   position: "relative",  flexDirection: "row", alignItems: "center", gap: RFValue(4), padding: RFValue(6) },
  backTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  title: { marginLeft: RFValue(8), color: "#fff", fontWeight: "900", fontSize: RFValue(20) },
  filterBar: { flexDirection: "row", paddingHorizontal: RFValue(12), paddingBottom: RFValue(8), gap: RFValue(8) },
  chip: { paddingHorizontal: RFValue(10), paddingVertical: RFValue(6), borderRadius: RFValue(999), backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  chipActive: { backgroundColor: "rgba(255,215,0,0.18)", borderColor: "rgba(255,215,0,0.38)" },
  chipTxt: { color: "#fff", fontWeight: "700", fontSize: RFValue(12) },
  chipTxtActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: RFValue(16), padding: RFValue(12), borderWidth: 1, borderColor: BORDER, ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }, android: { elevation: 6 } }) },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: RFValue(6) },
  badge: { width: RFValue(24), height: RFValue(24), borderRadius: RFValue(8), backgroundColor: "rgba(255,215,0,0.14)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,215,0,0.35)", marginRight: RFValue(8) },
  cardTitle: { color: "#fff", fontSize: RFValue(16), fontWeight: "900" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rangeLink: { color: "#c7b5ff", fontWeight: "800", fontSize: RFValue(12), textDecorationLine: "underline" },
  pill: { flexDirection: "row", alignItems: "center", paddingVertical: RFValue(4), paddingHorizontal: RFValue(10), borderRadius: RFValue(999) },
  dot: { width: RFValue(7), height: RFValue(7), borderRadius: RFValue(4), marginRight: RFValue(6) },
  pillText: { color: "#fff", fontWeight: "900", fontSize: RFValue(11) },
  divider: { height: 1, backgroundColor: DIV, marginTop: RFValue(10), marginBottom: RFValue(8) },
  detailsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: RFValue(6), paddingVertical: RFValue(2) },
  detailsTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  emptyWrap: { alignItems: "center", marginTop: RFValue(24) }, emptyText: { color: "rgba(255,255,255,0.85)" },
  modalWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: RFValue(16) },
  modalCard: { width: "100%", maxWidth: 560, backgroundColor: CARD_SOLID, borderWidth: 1, borderColor: BORDER, borderRadius: RFValue(18), padding: RFValue(14) },
  modalHeader: { flexDirection: "row", alignItems: "center" },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginLeft: RFValue(8), flex: 1 },
  closeBtn: { width: RFValue(30), height: RFValue(30), borderRadius: RFValue(8), alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  playerStatus: { color: "#8fd3ff", fontWeight: "800", fontSize: RFValue(12), textDecorationLine: "underline" },
  timelineWrap: { marginTop: RFValue(6), paddingLeft: RFValue(18) },
  timelineLine: { position: "absolute", left: RFValue(6), top: RFValue(6), bottom: 0, width: RFValue(2), backgroundColor: "rgba(255,255,255,0.08)" },
  timelineItem: { flexDirection: "row", marginBottom: RFValue(10) },
  timelineDot: { position: "absolute", left: -RFValue(2), width: RFValue(12), height: RFValue(12), borderRadius: RFValue(6), backgroundColor: CARD_SOLID, borderWidth: 2 },
  timelineCard: { flex: 1, backgroundColor: "#0f0c22", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: RFValue(12), padding: RFValue(10), marginLeft: RFValue(8) },
  dayHeading: { color: "rgba(255,255,255,0.92)", fontWeight: "900", marginBottom: RFValue(6) },
  pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  teamTxt: { color: "#fff", fontSize: RFValue(12) },
  resBadge: { paddingHorizontal: RFValue(10), paddingVertical: RFValue(4), borderRadius: RFValue(999), borderWidth: 1 },
  resBadgeTxt: { fontWeight: "900", fontSize: RFValue(11) },
  makePick: { color: GOLD, fontWeight: "800", fontSize: RFValue(12) },
  hrThin: { height: 1, backgroundColor: DIV, marginTop: RFValue(10) },
  modalActions: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(12) },
  primaryBtn: { flex: 1, backgroundColor: PURPLE, borderRadius: RFValue(12), paddingVertical: RFValue(12), alignItems: "center" },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  secondaryBtn: { paddingVertical: RFValue(12), paddingHorizontal: RFValue(16), borderRadius: RFValue(12), backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  secondaryTxt: { color: "#fff", fontWeight: "800" },
});
