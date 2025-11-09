// app/entries/index.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Animated, Easing, Pressable, Alert
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

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
  tournamentId: string;
  fee: number;
  startISO: string; // tournament_phase.start_date (YYYY-MM-DD)
  endISO: string;   // start + 2 days (YYYY-MM-DD)
  status: EntryStatus;
  planetName: string;
};

type DayRow = {
  iso: string;
  label: string;
  selection: "home" | "away" | null;
  result: "WIN" | "LOSS" | "PUSH" | "PENDING" | "ELIMINATED" | "—";
  _ui?: "open" | "locked" | "settled";
};

/* --------- Local date helpers --------- */
function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalISO(iso: string) {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}
const addDays = (d: Date, n: number) => {
  const z = new Date(d);
  z.setDate(z.getDate() + n);
  return z;
};

// fallback planet names by fee (can tweak)
const FEE_TO_PLANET: Record<number, string> = {
  20: "Tournament of Mars",
  50: "Tournament of Jupiter",
  100: "Tournament of Saturn",
};
const planetNameFor = (title?: string | null, cents?: number) =>
  title?.trim() || FEE_TO_PLANET[Math.round((cents || 0) / 100)] || "Tournament";

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
    scale.setValue(0.92);
    cardFade.setValue(0);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 120,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(cardFade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };
  const animateOut = (cb?: () => void) => {
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardFade, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => cb && cb());
  };

  const fetchEntries = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      setCards([]);
      return;
    }

    // 1) read user's entries
    const { data: entries, error: eErr } = await supabase
      .from("entries")
      .select("id, status, created_at, tournament_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (eErr) {
      Alert.alert("Error", eErr.message);
      throw eErr;
    }

    const tIds = Array.from(
      new Set((entries || []).map((e: any) => e.tournament_id))
    );
    if (tIds.length === 0) {
      setCards([]);
      return;
    }

    // 2) fetch tournaments from tournament_phase (view/table in your project)
    const { data: trows, error: tErr } = await supabase
      .from("tournament_phase")
      .select("id, start_date, end_date, entry_fee_cents, title")
      .in("id", tIds);
    if (tErr) {
      Alert.alert("Error", tErr.message);
      throw tErr;
    }

    const tById = new Map<string, any>();
    (trows || []).forEach((t: any) => tById.set(String(t.id), t));

    const rows: EntryCard[] = [];
    for (const e of entries || []) {
      const t = tById.get(String(e.tournament_id));
      if (!t) continue;

      const d0 = parseLocalISO(String(t.start_date));
      const d2 = addDays(d0, 2);

      let st: EntryStatus = "active";
      if (e.status === "eliminated") st = "eliminated";
      else if (e.status === "winner") st = "winner";
      else if (new Date() > d2) st = "finished";

      rows.push({
        entrantId: String(e.id),
        tournamentId: String(e.tournament_id),
        fee: Number(t.entry_fee_cents ?? 0) / 100,
        startISO: toLocalISO(d0),
        endISO: toLocalISO(d2),
        status: st,
        planetName: planetNameFor(t.title, t.entry_fee_cents),
      });
    }

    setCards(rows);
  }, []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        await fetchEntries();
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [fetchEntries]);

  const todayISO = toLocalISO(new Date());

  const openDetails = async (entry: EntryCard) => {
    try {
      setModalEntry(entry);

      // Build 3 local days starting from tournament start_date
      const base = parseLocalISO(entry.startISO);
      const daysLocal: DayRow[] = [0, 1, 2].map((off) => {
        const d = addDays(base, off);
        const iso = toLocalISO(d);
        const label = d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });

        // only today's date is "open"
        let ui: DayRow["_ui"];
        if (iso === todayISO) ui = "open";
        else if (iso < todayISO) ui = "settled"; // past
        else ui = "locked"; // future

        return {
          iso,
          label,
          selection: null,
          result: "PENDING",
          _ui: ui,
        };
      });

      // hydrate with picks for THIS entry & those days
      const { data: picks, error } = await supabase
        .from("picks")
        .select("entry_id, day_date, selection, result")
        .eq("entry_id", entry.entrantId)
        .in("day_date", daysLocal.map((d) => d.iso));
      if (error) throw error;

      const pMap = new Map<string, any>();
      (picks || []).forEach((p: any) => pMap.set(String(p.day_date), p));

      for (let i = 0; i < daysLocal.length; i++) {
        const iso = daysLocal[i].iso;
        const pk = pMap.get(iso);
        if (pk) {
          const RU = String(pk.result || "pending").toUpperCase();

          let result: DayRow["result"] = "PENDING";
          if (RU === "WIN") result = "WIN";
          else if (RU === "LOSS") result = "LOSS";
          else if (RU === "PUSH") result = "PUSH";
          else if (RU === "ELIMINATED") result = "ELIMINATED";

          daysLocal[i] = {
            ...daysLocal[i],
            selection: pk.selection,
            result,
            _ui: "locked", // once a pick exists, it's locked in this summary view
          };
        }
      }

      setModalDays(daysLocal);
      setOpen(true);
      requestAnimationFrame(animateIn);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not open entry details.");
    }
  };

  const closeDetails = () => animateOut(() => setOpen(false));

  const goManagePicks = () => {
    if (!modalEntry) return;

    const today = toLocalISO(new Date());
    const activeDay = modalDays.find(
      (d) => d.iso === today && d._ui === "open"
    );
    const dateParam = activeDay?.iso || modalEntry.startISO;

    router.push(
      `/entries/${modalEntry.entrantId}?date=${encodeURIComponent(dateParam)}`
    );
  };

  const visibleCards = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.status === filter)),
    [cards, filter]
  );

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchEntries();
    } finally {
      setRefreshing(false);
    }
  }, [fetchEntries]);

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Back to Tournaments + Title */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/tournaments")}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
          <Text style={styles.backTxt}>Tournaments</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Current Entries</Text>
        <View style={{ width: RFValue(90) }} />
      </View>

      {/* Filter */}
      <View style={styles.filterBar}>
        {(["all", "active", "eliminated", "winner", "finished"] as FilterKey[]).map(
          (k) => {
            const active = filter === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setFilter(k)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipTxt, active && styles.chipTxtActive]}
                >
                  {k[0].toUpperCase() + k.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      ) : (
        <FlatList
          data={visibleCards}
          keyExtractor={(it) => it.entrantId}
          contentContainerStyle={{
            paddingHorizontal: RFValue(14),
            paddingBottom: RFValue(32),
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: RFValue(12) }} />
          )}
          renderItem={({ item }) => {
            const pill = pillDef(item.status);
            return (
              <LinearGradient
                colors={["#1b1438", "#110d28"]}
                style={styles.card}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.badge}>
                    <Ionicons
                      name="trophy"
                      size={RFValue(14)}
                      color={GOLD}
                    />
                  </View>
                  <Text style={styles.cardTitle}>
                    {item.planetName} — ${item.fee}
                  </Text>
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.rangeLink}>
                    {prettyRange(item.startISO, item.endISO)}
                  </Text>
                  <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                    <View
                      style={[styles.dot, { backgroundColor: pill.dot }]}
                    />
                    <Text style={styles.pillText}>{pill.text}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <TouchableOpacity
                  onPress={() => openDetails(item)}
                  style={styles.detailsBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailsTxt}>View Details</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={RFValue(14)}
                    color="#fff"
                  />
                </TouchableOpacity>
              </LinearGradient>
            );
          }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No entries match this filter.
              </Text>
            </View>
          }
        />
      )}

      {/* Solid Details Modal */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={closeDetails}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.65)", opacity: backdrop },
          ]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDetails} />
        <View style={styles.modalWrap} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.modalCard,
              { opacity: cardFade, transform: [{ scale }] },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.badge}>
                <Ionicons
                  name="trophy"
                  size={RFValue(14)}
                  color={GOLD}
                />
              </View>
              <Text style={styles.modalTitle}>
                {modalEntry?.planetName} — ${modalEntry?.fee}
              </Text>
              <TouchableOpacity
                onPress={closeDetails}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={RFValue(18)} color="#fff" />
              </TouchableOpacity>
            </View>

            {modalDays.map((d) => {
              const pill = resultDef(d.result);
              return (
                <View
                  key={d.iso}
                  style={{
                    marginTop: RFValue(8),
                    backgroundColor: "#0f0c22",
                    borderRadius: RFValue(12),
                    padding: RFValue(10),
                    borderColor: BORDER,
                    borderWidth: 1,
                  }}
                >
                  <Text style={styles.dayHeading}>{d.label}</Text>
                  {d.selection ? (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={styles.teamTxt}>
                        {d.selection === "home" ? "Home pick" : "Away pick"}
                      </Text>
                      <View
                        style={[
                          styles.resBadge,
                          {
                            borderColor: pill.color,
                            backgroundColor: pill.bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.resBadgeTxt,
                            { color: pill.color },
                          ]}
                        >
                          {pill.text}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.makePick}>
                      {d._ui === "open"
                        ? "Make Your Selection"
                        : "Locked"}
                    </Text>
                  )}
                </View>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={goManagePicks}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryTxt}>Manage Picks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={closeDetails}
                style={styles.secondaryBtn}
              >
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
function prettyRange(startISO: string, endISO: string) {
  if (!startISO || !endISO) return "";
  const s = parseLocalISO(startISO),
    e = parseLocalISO(endISO);
  return `${s.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${e.toLocaleDateString(undefined, { day: "numeric" })}`;
}
function pillDef(status: EntryStatus) {
  switch (status) {
    case "active":
      return {
        text: "Active",
        dot: "#22e58b",
        bg: "rgba(34,229,139,0.14)",
      };
    case "eliminated":
      return {
        text: "Eliminated",
        dot: "#ff5e5e",
        bg: "rgba(255,94,94,0.16)",
      };
    case "winner":
      return {
        text: "Winner",
        dot: GOLD,
        bg: "rgba(255,215,0,0.18)",
      };
    default:
      return {
        text: "Finished",
        dot: "#9d7cff",
        bg: "rgba(157,124,255,0.18)",
      };
  }
}
function resultDef(r: DayRow["result"]) {
  switch (r) {
    case "WIN":
      return {
        text: "WON",
        color: "#28e3a4",
        bg: "rgba(40,227,164,0.12)",
      };
    case "LOSS":
      return {
        text: "LOST",
        color: "#ff6b6b",
        bg: "rgba(255,107,107,0.12)",
      };
    case "PUSH":
      return {
        text: "PUSH",
        color: GOLD,
        bg: "rgba(255,215,0,0.14)",
      };
    case "ELIMINATED":
      return {
        text: "ELIMINATED",
        color: "#ff6b6b",
        bg: "rgba(255,107,107,0.16)",
      };
    case "PENDING":
      return {
        text: "Pending…",
        color: "#c9baff",
        bg: "rgba(201,186,255,0.12)",
      };
    default:
      return { text: "—", color: "#fff", bg: "transparent" };
  }
}

/* styles */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0d0013" },
  topBar: {
    marginTop: RFValue(40),
    paddingTop: RFValue(10),
    paddingBottom: RFValue(8),
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: RFValue(12),
    top: RFValue(8),
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(4),
    padding: RFValue(6),
  },
  backTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(20) },

  filterBar: {
    flexDirection: "row",
    paddingHorizontal: RFValue(12),
    paddingBottom: RFValue(8),
    gap: RFValue(8),
  },
  chip: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  chipActive: {
    backgroundColor: "rgba(255,215,0,0.18)",
    borderColor: "rgba(255,215,0,0.38)",
  },
  chipTxt: { color: "#fff", fontWeight: "700", fontSize: RFValue(12) },
  chipTxtActive: { color: "#fff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: RFValue(16),
    padding: RFValue(12),
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: RFValue(6),
  },
  badge: {
    width: RFValue(24),
    height: RFValue(24),
    borderRadius: RFValue(8),
    backgroundColor: "rgba(255,215,0,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    marginRight: RFValue(8),
  },
  cardTitle: {
    color: "#fff",
    fontSize: RFValue(16),
    fontWeight: "900",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeLink: {
    color: "#c7b5ff",
    fontWeight: "800",
    fontSize: RFValue(12),
    textDecorationLine: "underline",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(4),
    paddingHorizontal: RFValue(10),
    borderRadius: RFValue(999),
  },
  dot: {
    width: RFValue(7),
    height: RFValue(7),
    borderRadius: RFValue(4),
    marginRight: RFValue(6),
  },
  pillText: { color: "#fff", fontWeight: "900", fontSize: RFValue(11) },
  divider: {
    height: 1,
    backgroundColor: DIV,
    marginTop: RFValue(10),
    marginBottom: RFValue(8),
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: RFValue(6),
    paddingVertical: RFValue(2),
  },
  detailsTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  emptyWrap: { alignItems: "center", marginTop: RFValue(24) },
  emptyText: { color: "rgba(255,255,255,0.85)" },

  modalWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: RFValue(16),
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: CARD_SOLID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RFValue(18),
    padding: RFValue(14),
  },
  modalHeader: { flexDirection: "row", alignItems: "center" },
  modalTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(16),
    marginLeft: RFValue(8),
    flex: 1,
  },
  closeBtn: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  dayHeading: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "900",
    marginBottom: RFValue(6),
  },
  teamTxt: { color: "#fff", fontSize: RFValue(12) },
  resBadge: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    borderWidth: 1,
  },
  resBadgeTxt: { fontWeight: "900", fontSize: RFValue(11) },
  makePick: { color: GOLD, fontWeight: "800", fontSize: RFValue(12) },

  modalActions: {
    flexDirection: "row",
    gap: RFValue(10),
    marginTop: RFValue(12),
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: PURPLE,
    borderRadius: RFValue(12),
    paddingVertical: RFValue(12),
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  secondaryBtn: {
    paddingVertical: RFValue(12),
    paddingHorizontal: RFValue(16),
    borderRadius: RFValue(12),
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  secondaryTxt: { color: "#fff", fontWeight: "800" },
});
