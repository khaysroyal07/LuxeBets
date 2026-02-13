import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const INK = "#07030D";
const BORDER = "rgba(255,255,255,0.12)";
const GLASS = "rgba(10,10,20,0.62)";
const GLASS_STRONG = "rgba(10,10,20,0.82)";
const MUTED = "rgba(255,255,255,0.70)";
const MUTED2 = "rgba(255,255,255,0.55)";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** week window helper using tournaments.start_date */
const ANCHOR_WEEKDAY = 2; // Tue
const toLocalISO = (d: Date) => {
  const y = d.getFullYear(),
    m = `${d.getMonth() + 1}`.padStart(2, "0"),
    day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};
function currentWindow(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = base.getDay();
  const diff = (dow - ANCHOR_WEEKDAY + 7) % 7;
  const start = new Date(base);
  start.setDate(start.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  return { startISO: toLocalISO(start), endISO: toLocalISO(end) };
}
const humanDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

function planetFromFee(entryFeeCents?: number | null) {
  const fee = (entryFeeCents || 0) / 100;
  if (fee >= 100) return "Saturn";
  if (fee >= 50) return "Jupiter";
  return "Mars";
}

function last4(id?: string | null) {
  const s = String(id || "");
  if (!s) return "----";
  return s.slice(-4).toUpperCase();
}

function getTournamentStatusLabel(t: any) {
  // Prefer explicit t.status if you set it server-side
  const raw = String(t?.status || "").toLowerCase();

  // Settled wins
  if (t?.settled_at) return "SETTLED";

  // If you set status values like "active", "open", "closed", "settling"
  if (raw) {
    if (raw.includes("settle")) return "SETTLING";
    if (raw.includes("close")) return "CLOSED";
    if (raw.includes("open")) return "OPEN";
    if (raw.includes("active")) return "ACTIVE";
  }

  // Fallback to join window
  const now = Date.now();
  const openAt = t?.join_open_at ? new Date(t.join_open_at).getTime() : null;
  const closeAt = t?.join_close_at ? new Date(t.join_close_at).getTime() : null;

  if (openAt != null && now < openAt) return "UPCOMING";
  if (openAt != null && closeAt != null && now >= openAt && now <= closeAt) return "OPEN";
  if (closeAt != null && now > closeAt) return "LOCKED";

  return "ACTIVE";
}

function pillStyleForLabel(label: string) {
  const s = String(label || "").toUpperCase();
  if (s === "SETTLED")
    return { backgroundColor: "rgba(0,255,170,0.14)", borderColor: "rgba(0,255,170,0.42)" };
  if (s === "OPEN")
    return { backgroundColor: "rgba(255,215,0,0.12)", borderColor: "rgba(255,215,0,0.42)" };
  if (s === "LOCKED" || s === "CLOSED")
    return { backgroundColor: "rgba(255,120,80,0.12)", borderColor: "rgba(255,120,80,0.38)" };
  if (s === "UPCOMING")
    return { backgroundColor: "rgba(140,140,255,0.12)", borderColor: "rgba(140,140,255,0.36)" };
  // ACTIVE default
  return { backgroundColor: "rgba(97,61,193,0.16)", borderColor: "rgba(97,61,193,0.46)" };
}

type HistoryRow = {
  key: string;
  tournamentId: string;
  entryId: string;

  title: string;
  planetLabel: string;

  entryFee: number;
  startISO?: string | null;
  endISO?: string | null;
  dateHuman: string;

  statusLabel: string;

  // leaderboards
  points?: number | null;
  rank?: number | null;
  entrants?: number | null;

  expanded?: boolean;
};

export default function TournamentHistory() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  // NO eliminations. Just useful filters.
  const [filter, setFilter] = useState<"all" | "settled" | "open" | "active">("all");

  const { startISO, endISO } = useMemo(() => currentWindow(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setRows([]);
        return;
      }

      // 1) My entries (we only need ids + tournament_id + created_at)
      const { data: myEntries, error: eErr } = await supabase
        .from("entries")
        .select("id, tournament_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (eErr) throw eErr;

      const entryList = myEntries || [];
      const tournamentIds = Array.from(
        new Set(entryList.map((e: any) => String(e.tournament_id)))
      ).filter(Boolean);

      if (!tournamentIds.length) {
        setRows([]);
        return;
      }

      // 2) Tournaments
      const { data: tours, error: tErr } = await supabase
        .from("tournaments")
        .select(
          "id, title, tier, entry_fee_cents, start_date, end_date, join_open_at, join_close_at, status, settled_at"
        )
        .in("id", tournamentIds)
        .order("start_date", { ascending: false });

      if (tErr) throw tErr;

      // History = outside current Tue–Thu window (your existing rule)
      const historyTours = (tours || []).filter((t: any) => {
        const iso = String(t?.start_date || "");
        return !(iso >= startISO && iso <= endISO);
      });

      // 3) Map tournament -> my most recent entry for that tournament
      const entByTid = new Map<string, any>();
      entryList.forEach((e: any) => {
        const tid = String(e?.tournament_id);
        if (tid && !entByTid.has(tid)) entByTid.set(tid, e);
      });

      // 4) Pull my leaderboard rows for these tournaments (rank + points_total)
      const { data: myLB, error: lbErr } = await supabase
        .from("leaderboards")
        .select("tournament_id, points_total, rank")
        .eq("user_id", user.id)
        .in(
          "tournament_id",
          historyTours.map((t: any) => t.id)
        );

      if (lbErr) {
        // don’t fail the whole screen
        console.warn("leaderboards fetch error:", lbErr);
      }

      const lbByTid = new Map<string, any>();
      (myLB || []).forEach((r: any) => lbByTid.set(String(r.tournament_id), r));

      // 5) Entrants count (pull leaderboards tournament_id only and count client-side)
      const { data: lbCounts, error: lbCntErr } = await supabase
        .from("leaderboards")
        .select("tournament_id")
        .in(
          "tournament_id",
          historyTours.map((t: any) => t.id)
        );

      if (lbCntErr) {
        console.warn("leaderboards count error:", lbCntErr);
      }

      const entrantsByTid = new Map<string, number>();
      (lbCounts || []).forEach((r: any) => {
        const tid = String(r.tournament_id);
        entrantsByTid.set(tid, (entrantsByTid.get(tid) || 0) + 1);
      });

      // 6) Build rows
      const out: HistoryRow[] = [];
      for (const t of historyTours) {
        const tid = String(t.id);
        const myEnt = entByTid.get(tid);
        if (!myEnt) continue;

        const feeCents = Number(t.entry_fee_cents || 0);
        const planet = t.planet_name || planetFromFee(feeCents);
        const title = t.title || `${planet} — $${(feeCents / 100).toFixed(0)}`;

        const statusLabel = getTournamentStatusLabel(t);

        const lb = lbByTid.get(tid);
        const entrants = entrantsByTid.get(tid) ?? null;

        out.push({
          key: `${tid}:${myEnt.id}`,
          tournamentId: tid,
          entryId: String(myEnt.id),
          title,
          planetLabel: planet,
          entryFee: feeCents / 100,
          startISO: t.start_date,
          endISO: t.end_date,
          dateHuman: humanDate(t.start_date),
          statusLabel,
          points: lb?.points_total ?? null,
          rank: lb?.rank ?? null,
          entrants,
          expanded: false,
        });
      }

      setRows(out);
    } catch (err) {
      console.warn("history error:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startISO, endISO]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const toggleExpand = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, expanded: !r.expanded } : r))
    );
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.planetLabel.toLowerCase().includes(q) ||
        String(r.entryFee).includes(q) ||
        last4(r.entryId).toLowerCase().includes(q);

      const label = String(r.statusLabel || "").toUpperCase();
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "settled"
          ? label === "SETTLED"
          : filter === "open"
          ? label === "OPEN"
          : label === "ACTIVE" || label === "LOCKED" || label === "CLOSED" || label === "SETTLING";

      return matchesQ && matchesFilter;
    });
  }, [rows, query, filter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const settled = rows.filter((r) => String(r.statusLabel).toUpperCase() === "SETTLED").length;
    const open = rows.filter((r) => String(r.statusLabel).toUpperCase() === "OPEN").length;
    return { total, settled, open };
  }, [rows]);

  const renderItem = ({ item }: { item: HistoryRow }) => {
    const rankText =
      item.rank != null && item.entrants != null
        ? `#${item.rank} of ${item.entrants}`
        : item.rank != null
        ? `#${item.rank}`
        : item.entrants != null
        ? `of ${item.entrants}`
        : "—";

    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => toggleExpand(item.key)}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planet}>{item.planetLabel}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.dateTxt}>{item.dateHuman}</Text>
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <View style={[styles.pill, pillStyleForLabel(item.statusLabel)]}>
                <Text style={styles.pillTxt}>{item.statusLabel}</Text>
              </View>

              <View style={styles.rankBox}>
                <Ionicons name="trophy-outline" size={RFValue(14)} color={GOLD} />
                <Text style={styles.rankTxt}>{rankText}</Text>
              </View>
            </View>
          </View>

          <View style={styles.quickRow}>
            <View style={styles.quickChip}>
              <Text style={styles.quickLabel}>Entry</Text>
              <Text style={styles.quickValue}>${item.entryFee.toFixed(0)}</Text>
            </View>

            <View style={styles.quickChip}>
              <Text style={styles.quickLabel}>Points</Text>
              <Text style={styles.quickValueGold}>
                {item.points != null ? String(item.points) : "—"}
              </Text>
            </View>

            <View style={styles.quickChip}>
              <Text style={styles.quickLabel}>Entry ID</Text>
              <Text style={styles.quickValue}>…{last4(item.entryId)}</Text>
            </View>
          </View>

          {item.expanded && (
            <View style={styles.expand}>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tournament dates</Text>
                <Text style={styles.detailValue}>
                  {humanDate(item.startISO)} → {humanDate(item.endISO)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Rank</Text>
                <Text style={styles.detailValue}>
                  {item.rank != null && item.entrants != null
                    ? `#${item.rank} / ${item.entrants}`
                    : item.rank != null
                    ? `#${item.rank}`
                    : "Rank unavailable"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Points Total</Text>
                <Text style={styles.detailValue}>
                  {item.points != null ? String(item.points) : "—"}
                </Text>
              </View>

              <Text style={styles.tapHint}>Tap card to collapse</Text>
            </View>
          )}

          <View style={styles.chev}>
            <Ionicons
              name={item.expanded ? "chevron-up" : "chevron-down"}
              size={RFValue(18)}
              color={MUTED2}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
        <Text style={{ color: MUTED, marginTop: RFValue(10) }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={BG} style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{
          padding: RFValue(16),
          paddingTop: RFValue(44),
          paddingBottom: RFValue(60),
        }}
        data={filtered}
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ItemSeparatorComponent={() => <View style={{ height: RFValue(10) }} />}
        ListHeaderComponent={
          <View>
            <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
              <Ionicons name="chevron-back" size={RFValue(18)} color={PURPLE} />
              <Text style={styles.back}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Tournament History</Text>

            <View style={styles.summary}>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryNum}>{summary.total}</Text>
                <Text style={styles.summaryLbl}>Total</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryNum}>{summary.settled}</Text>
                <Text style={styles.summaryLbl}>Settled</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryNum}>{summary.open}</Text>
                <Text style={styles.summaryLbl}>Open</Text>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={RFValue(16)} color={MUTED2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search: Mars, $50, entry …1234"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.search}
              />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={RFValue(18)} color={MUTED2} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filters}>
              <FilterPill label="All" active={filter === "all"} onPress={() => setFilter("all")} />
              <FilterPill
                label="Settled"
                active={filter === "settled"}
                onPress={() => setFilter("settled")}
              />
              <FilterPill label="Open" active={filter === "open"} onPress={() => setFilter("open")} />
              <FilterPill
                label="Active"
                active={filter === "active"}
                onPress={() => setFilter("active")}
              />
            </View>

            <View style={{ height: RFValue(10) }} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="planet-outline" size={RFValue(26)} color={MUTED2} />
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptySub}>
              Past tournaments will show here with your rank + points.
            </Text>
          </View>
        }
      />
    </ImageBackground>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.filterPill, active ? styles.filterPillActive : styles.filterPillIdle]}>
        <Text style={[styles.filterTxt, active && { color: "#0B0710" }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: INK },

  backRow: { flexDirection: "row", alignItems: "center", marginBottom: RFValue(6) },
  back: { color: PURPLE, fontWeight: "800", fontSize: RFValue(15) },

  title: {
    color: "#fff",
    fontWeight: "950",
    fontSize: RFValue(24),
    marginBottom: RFValue(10),
    letterSpacing: 0.2,
  },

  summary: { flexDirection: "row", gap: RFValue(8), marginBottom: RFValue(12) },
  summaryChip: {
    flex: 1,
    backgroundColor: GLASS,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: RFValue(14),
    paddingVertical: RFValue(10),
    alignItems: "center",
  },
  summaryNum: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  summaryLbl: { color: MUTED2, fontWeight: "800", fontSize: RFValue(11), marginTop: 2 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(8),
    backgroundColor: GLASS,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: RFValue(16),
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    marginBottom: RFValue(10),
  },
  search: { flex: 1, color: "#fff", fontWeight: "700", fontSize: RFValue(13) },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: RFValue(8), marginBottom: RFValue(4) },
  filterPill: { paddingHorizontal: RFValue(12), paddingVertical: RFValue(8), borderRadius: RFValue(999), borderWidth: 1 },
  filterPillIdle: { backgroundColor: GLASS, borderColor: BORDER },
  filterPillActive: { backgroundColor: GOLD, borderColor: "rgba(255,215,0,0.55)" },
  filterTxt: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },

  card: { backgroundColor: GLASS_STRONG, borderColor: BORDER, borderWidth: 1, borderRadius: RFValue(18), padding: RFValue(14) },
  topRow: { flexDirection: "row", justifyContent: "space-between", gap: RFValue(12) },
  planet: { color: "rgba(255,215,0,0.80)", fontWeight: "900", fontSize: RFValue(12) },
  name: { color: "#fff", fontWeight: "950", fontSize: RFValue(16), marginTop: 2 },
  dateTxt: { color: MUTED2, marginTop: RFValue(4), fontWeight: "700" },

  pill: { paddingHorizontal: RFValue(10), paddingVertical: RFValue(5), borderRadius: RFValue(999), borderWidth: 1 },
  pillTxt: { color: "#fff", fontWeight: "900", fontSize: RFValue(11), letterSpacing: 0.3 },

  rankBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(6),
    marginTop: RFValue(10),
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(12),
  },
  rankTxt: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },

  quickRow: { flexDirection: "row", gap: RFValue(8), marginTop: RFValue(12) },
  quickChip: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderRadius: RFValue(14),
    paddingVertical: RFValue(10),
    alignItems: "center",
  },
  quickLabel: { color: MUTED2, fontWeight: "900", fontSize: RFValue(10), marginBottom: 2 },
  quickValue: { color: "#fff", fontWeight: "950", fontSize: RFValue(14) },
  quickValueGold: { color: GOLD, fontWeight: "950", fontSize: RFValue(14) },

  expand: { marginTop: RFValue(12) },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginBottom: RFValue(12) },

  detailRow: { marginBottom: RFValue(10) },
  detailLabel: { color: MUTED2, fontWeight: "900", fontSize: RFValue(11), marginBottom: 3 },
  detailValue: { color: "#fff", fontWeight: "800", fontSize: RFValue(12), lineHeight: RFValue(16) },

  tapHint: { color: "rgba(255,255,255,0.40)", fontWeight: "800", fontSize: RFValue(11), marginTop: RFValue(2) },
  chev: { alignItems: "center", marginTop: RFValue(10) },

  empty: {
    marginTop: RFValue(26),
    backgroundColor: GLASS,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: RFValue(18),
    padding: RFValue(16),
    alignItems: "center",
  },
  emptyTitle: { color: "#fff", fontWeight: "950", fontSize: RFValue(16), marginTop: RFValue(10) },
  emptySub: { color: MUTED2, fontWeight: "700", fontSize: RFValue(12), marginTop: RFValue(6), textAlign: "center" },
});
