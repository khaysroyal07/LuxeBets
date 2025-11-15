// app/entries/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.18)";
const DIV = "rgba(255,255,255,0.10)";

type EntryStatus = "active" | "eliminated" | "winner" | "finished";
type FilterKey = "all" | EntryStatus;

type EntryCard = {
  id: string;
  tournamentId: string;
  fee: number;
  startISO: string; // YYYY-MM-DD
  endISO: string; // YYYY-MM-DD
  status: EntryStatus;
  planetName: string;
};

/* --------- Date Helpers --------- */
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

// fallback planet names by fee
const FEE_TO_PLANET: Record<number, string> = {
  20: "Tournament of Mars",
  50: "Tournament of Jupiter",
  100: "Tournament of Saturn",
};
const planetNameFor = (title?: string | null, cents?: number) =>
  title?.trim() ||
  FEE_TO_PLANET[Math.round((cents || 0) / 100)] ||
  "Tournament";

/* --------- Status pill helpers --------- */
function pillDef(status: EntryStatus) {
  switch (status) {
    case "active":
      return {
        text: "Active",
        dot: "#22e58b",
        bg: "rgba(34,229,139,0.16)",
      };
    case "eliminated":
      return {
        text: "Eliminated",
        dot: "#ff5e5e",
        bg: "rgba(255,94,94,0.18)",
      };
    case "winner":
      return {
        text: "Winner",
        dot: GOLD,
        bg: "rgba(255,215,0,0.22)",
      };
    default:
      return {
        text: "Finished",
        dot: "#9d7cff",
        bg: "rgba(157,124,255,0.22)",
      };
  }
}

function prettyRange(startISO: string, endISO: string) {
  if (!startISO || !endISO) return "";
  const s = parseLocalISO(startISO);
  const e = parseLocalISO(endISO);
  return `${s.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${e.toLocaleDateString(undefined, { day: "numeric" })}`;
}

export default function EntriesIndex() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<EntryCard[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");

  const fetchEntries = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      setCards([]);
      return;
    }

    // entries table (your schema)
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

    // tournament_phase table (your schema)
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

    const now = new Date();
    const rows: EntryCard[] = [];

    for (const e of entries || []) {
      const t = tById.get(String(e.tournament_id));
      if (!t) continue;

      const d0 = parseLocalISO(String(t.start_date));
      // your tournaments are 3 days → start_date + 2
      const d2 = addDays(d0, 2);

      let st: EntryStatus = "active";
      if (e.status === "eliminated") st = "eliminated";
      else if (e.status === "winner") st = "winner";
      else if (now > d2) st = "finished";

      rows.push({
        id: String(e.id),
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
    (async () => {
      try {
        setLoading(true);
        await fetchEntries();
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchEntries]);

  const visibleCards = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.status === filter)),
    [cards, filter]
  );

  const summary = useMemo(() => {
    const total = cards.length;
    const active = cards.filter((c) => c.status === "active").length;
    const finished = cards.filter(
      (c) => c.status === "finished" || c.status === "winner"
    ).length;
    const eliminated = cards.filter((c) => c.status === "eliminated").length;
    return { total, active, finished, eliminated };
  }, [cards]);

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
      {/* Top header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/tournaments")}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
          <Text style={styles.backTxt}>Tournaments</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Galaxy Entries</Text>
        <View style={{ width: RFValue(90) }} />
      </View>

      {/* Subheader summary card */}
      <LinearGradient
        colors={["rgba(31,18,61,0.96)", "rgba(8,4,26,0.96)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.summaryCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>Tournament Overview</Text>
          <Text style={styles.summarySubtitle}>
            Track your entries across the galaxy.
          </Text>
        </View>
        <View style={styles.summaryCounts}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryNumber}>{summary.active}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryNumber}>{summary.finished}</Text>
            <Text style={styles.summaryLabel}>Finished</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryNumber}>{summary.eliminated}</Text>
            <Text style={styles.summaryLabel}>Eliminated</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filter chips */}
      <View style={styles.filterBar}>
        {(
          ["all", "active", "eliminated", "winner", "finished"] as FilterKey[]
        ).map((k) => {
          const active = filter === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setFilter(k)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                {k[0].toUpperCase() + k.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <FlatList
          data={visibleCards}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{
            paddingHorizontal: RFValue(14),
            paddingBottom: RFValue(32),
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: RFValue(12) }} />
          )}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No entries found in this filter.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push("/(tabs)/tournaments")}
              >
                <Text style={styles.emptyBtnTxt}>Browse Tournaments</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const pill = pillDef(item.status);

            // lock manage picks if fully done
            const isClosed =
              item.status === "finished" || item.status === "winner";

            return (
              <LinearGradient
                colors={["#211443", "#130b2a"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                {/* Top row: badge + name/fee */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.badge}>
                    <Ionicons name="planet" size={RFValue(14)} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.planetName}</Text>
                    <Text style={styles.cardFee}>Entry: ${item.fee}</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                    <View style={[styles.dot, { backgroundColor: pill.dot }]} />
                    <Text style={styles.pillText}>{pill.text}</Text>
                  </View>
                </View>

                {/* Date range */}
                <View style={styles.rowBetween}>
                  <Text style={styles.rangeLabel}>Tournament Window</Text>
                  <Text style={styles.rangeValue}>
                    {prettyRange(item.startISO, item.endISO)}
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.leaderBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/leaderboard",
                        params: {
                          tournamentId: item.tournamentId,
                          entryId: item.id,
                        },
                      } as any)
                    }
                  >
                    <Ionicons
                      name="eye"
                      size={RFValue(14)}
                      color={GOLD}
                      style={{ marginRight: RFValue(4) }}
                    />
                    <Text style={styles.leaderTxt}>View Leaderboard</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isClosed}
                    onPress={() =>
                      router.push({
                        pathname: "/entries/manage/[entryId]",
                        params: { entryId: item.id },
                      } as any)
                    }
                    style={[
                      styles.manageBtn,
                      isClosed && styles.manageBtnDisabled,
                    ]}
                  >
                    <Text style={styles.manageTxt}>
                      {isClosed ? "Closed" : "Manage Picks"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            );
          }}
        />
      )}
    </ImageBackground>
  );
}

/* --- Styles --- */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#050012" },

  topBar: {
    marginTop: RFValue(40),
    paddingTop: RFValue(10),
    paddingBottom: RFValue(4),
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
  title: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(20),
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },

  summaryCard: {
    marginHorizontal: RFValue(14),
    marginTop: RFValue(8),
    marginBottom: RFValue(8),
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    flexDirection: "row",
    alignItems: "center",
  },
  summaryTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(13),
  },
  summarySubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10),
    marginTop: RFValue(2),
  },
  summaryCounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(8),
  },
  summaryPill: {
    minWidth: RFValue(40),
    alignItems: "center",
    paddingHorizontal: RFValue(6),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(5,5,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  summaryNumber: {
    color: GOLD,
    fontWeight: "900",
    fontSize: RFValue(13),
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: RFValue(9),
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipActive: {
    backgroundColor: "rgba(255,215,0,0.16)",
    borderColor: "rgba(255,215,0,0.4)",
  },
  chipTxt: { color: "#fff", fontWeight: "700", fontSize: RFValue(11) },
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
    marginBottom: RFValue(8),
  },
  badge: {
    width: RFValue(26),
    height: RFValue(26),
    borderRadius: RFValue(9),
    backgroundColor: "rgba(255,215,0,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    marginRight: RFValue(8),
  },
  cardTitle: {
    color: "#fff",
    fontSize: RFValue(15),
    fontWeight: "900",
  },
  cardFee: {
    color: "rgba(255,255,255,0.78)",
    fontSize: RFValue(11),
    marginTop: RFValue(2),
  },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10),
  },
  rangeValue: {
    color: "#c7b5ff",
    fontWeight: "800",
    fontSize: RFValue(11),
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

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: RFValue(8),
  },
  leaderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(8),
    paddingHorizontal: RFValue(10),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(9,7,25,0.9)",
  },
  leaderTxt: {
    color: GOLD,
    fontWeight: "800",
    fontSize: RFValue(11),
  },
  manageBtn: {
    paddingHorizontal: RFValue(14),
    paddingVertical: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: GOLD,
  },
  manageBtnDisabled: {
    opacity: 0.4,
  },
  manageTxt: {
    color: "#160921",
    fontWeight: "900",
    fontSize: RFValue(11),
  },

  emptyWrap: {
    alignItems: "center",
    marginTop: RFValue(40),
    paddingHorizontal: RFValue(20),
  },
  emptyText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: RFValue(12),
    textAlign: "center",
    marginBottom: RFValue(14),
  },
  emptyBtn: {
    paddingHorizontal: RFValue(16),
    paddingVertical: RFValue(10),
    borderRadius: RFValue(999),
    backgroundColor: PURPLE,
  },
  emptyBtnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(12),
  },
});
