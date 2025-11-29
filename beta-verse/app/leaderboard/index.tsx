// app/leaderboard/index.tsx
import React, { useEffect, useState, useMemo } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.95)";

type LeaderRow = {
  entry_id: string;
  user_id: string;
  points_total: number;
  status: string;
  profiles?: {
    id?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
};

type Tournament = {
  id: string;
  planet_name?: string | null;
  tier?: string | null;
  entry_fee_cents?: number | null;
  status?: string | null;
  week_label?: string | null;
  start_date?: string | null; // Sunday of tournament week
};

type WeekOption = {
  key: string; // sunday ISO: "2025-11-16"
  label: string; // "Nov 16"
  monthKey: string; // "2025-11"
  monthLabel: string; // "Nov 2025"
};

type MonthOption = {
  key: string;
  label: string;
};

const TARGET_POINTS = 20;

const tierLabel = (pts: number) => {
  if (pts >= TARGET_POINTS) return "100% Pool Tier";
  if (pts >= TARGET_POINTS / 2) return "50% Pool Tier";
  return "25% Pool Tier";
};

const tierColor = (pts: number) => {
  if (pts >= TARGET_POINTS) return GOLD;
  if (pts >= TARGET_POINTS / 2) return "#8AE1FF";
  return "#B39DDB";
};

export default function LeaderboardScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTid, setSelectedTid] = useState<string | null>(null);

  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const [weekMenuOpen, setWeekMenuOpen] = useState(false);

  const title = useMemo(() => "Tournament Leaderboard", []);

  /* -------- Fetch tournaments & build week + month lists -------- */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);

        const { data, error } = await supabase
          .from("tournaments")
          .select(
            `
              id,
              tier,
              planet_name,
              week_label,
              start_date,
              entry_fee_cents,
              status,
              created_at
            `
          )
          .lte("start_date", todayStr) // remove this line if you want future weeks too
          .order("start_date", { ascending: false });

        if (error) throw error;
        if (!on) return;

        const all = (data || []) as Tournament[];
        setTournaments(all);

        const weeksMap = new Map<string, WeekOption>();

        for (const t of all) {
          if (!t.start_date) continue;
          const iso = t.start_date;
          if (weeksMap.has(iso)) continue;

          const dt = new Date(`${iso}T00:00:00Z`);
          const monthKey = `${dt.getFullYear()}-${String(
            dt.getMonth() + 1
          ).padStart(2, "0")}`;
          const monthLabel = dt.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          });
          const label = dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          weeksMap.set(iso, {
            key: iso,
            label,
            monthKey,
            monthLabel,
          });
        }

        const weeks = Array.from(weeksMap.values()).sort((a, b) =>
          b.key.localeCompare(a.key)
        );
        setWeekOptions(weeks);

        if (weeks[0]) {
          setSelectedWeekKey(weeks[0].key);
          setSelectedMonthKey(weeks[0].monthKey);

          const weekTournaments = all.filter(
            (t) => t.start_date === weeks[0].key
          );
          if (weekTournaments[0]) {
            setSelectedTid(weekTournaments[0].id);
          }
        }
      } catch (e: any) {
        console.warn("tournaments fetch error", e);
        setErrorMsg(e?.message || "Failed to load tournaments.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  /* -------- Derived months & tournaments for selected week -------- */
  const monthOptions: MonthOption[] = useMemo(() => {
    const map = new Map<string, MonthOption>();
    for (const w of weekOptions) {
      if (!map.has(w.monthKey)) {
        map.set(w.monthKey, { key: w.monthKey, label: w.monthLabel });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [weekOptions]);

  const tournamentsForWeek = useMemo(() => {
    if (!selectedWeekKey) return [];
    return tournaments.filter((t) => t.start_date === selectedWeekKey);
  }, [tournaments, selectedWeekKey]);

  /* -------- Week selection handler -------- */
  const handleWeekSelect = (week: WeekOption) => {
    setSelectedWeekKey(week.key);
    setSelectedMonthKey(week.monthKey);
    setWeekMenuOpen(false);

    const weekTournaments = tournaments.filter(
      (t) => t.start_date === week.key
    );
    if (weekTournaments[0]) {
      setSelectedTid(weekTournaments[0].id);
    } else {
      setSelectedTid(null);
      setRows([]);
    }
  };

  // keep selectedTid inside the selected week
  useEffect(() => {
    if (!tournamentsForWeek.length) return;

    const existsInWeek = tournamentsForWeek.some((t) => t.id === selectedTid);
    if (!selectedTid || !existsInWeek) {
      setSelectedTid(tournamentsForWeek[0].id);
    }
  }, [tournamentsForWeek, selectedTid]);

  /* -------- Fetch leaderboard by week + optional tournament -------- */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        if (!selectedWeekKey) {
          setRows([]);
          return;
        }

        const weekTournamentIds = tournaments
          .filter((t) => t.start_date === selectedWeekKey)
          .map((t) => t.id);

        if (!weekTournamentIds.length) {
          setRows([]);
          return;
        }

        setLoading(true);
        setErrorMsg("");

        const idsFilter =
          selectedTid && weekTournamentIds.includes(selectedTid)
            ? [selectedTid]
            : weekTournamentIds;

        let data: any[] | null = null;

        const { data: dataWithProfiles, error: errorWithProfiles } =
          await supabase
            .from("entries")
            .select(`
              id,
              user_id,
              points_total,
              status,
              tournament_id,
              profiles:profiles!entries_user_id_fkey (
                id,
                username,
                avatar_url
              )
            `)
            .in("tournament_id", idsFilter)
            .order("points_total", { ascending: false });

        if (errorWithProfiles) {
          if (errorWithProfiles.code === "PGRST200") {
            const { data: basicData, error: basicError } = await supabase
              .from("entries")
              .select("id, user_id, points_total, status, tournament_id")
              .in("tournament_id", idsFilter)
              .order("points_total", { ascending: false });
            if (basicError) throw basicError;
            data = basicData ?? [];
          } else {
            throw errorWithProfiles;
          }
        } else {
          data = dataWithProfiles ?? [];
        }

        if (!on) return;

        const mapped: LeaderRow[] =
          (data || []).map((row: any) => ({
            entry_id: row.id,
            user_id: row.user_id,
            points_total: row.points_total ?? 0,
            status: row.status,
            profiles: row.profiles ?? null,
          })) ?? [];

        setRows(mapped);
      } catch (e: any) {
        console.warn("leaderboard fetch error", e);
        setErrorMsg(e?.message || "Failed to load leaderboard.");
        setRows([]);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [selectedWeekKey, selectedTid, tournaments]);

  /* -------- Helpers -------- */
  const currentTournament = useMemo(
    () =>
      tournamentsForWeek.find((t) => t.id === selectedTid) ||
      tournamentsForWeek[0] ||
      null,
    [tournamentsForWeek, selectedTid]
  );

  const headerSubtitle = currentTournament
    ? currentTournament.planet_name ||
      currentTournament.tier ||
      "Current Tournament"
    : "Current Tournament";

  const selectedWeek = weekOptions.find((w) => w.key === selectedWeekKey);
  const selectedWeekLabel = selectedWeek
    ? `${selectedWeek.label} (${selectedWeek.monthLabel})`
    : "Select week";

  if (loading && !selectedWeekKey && !tournaments.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.iconBtn}>
          <Ionicons
            name="chevron-back"
            size={RFValue(18)}
            color="#fff"
            onPress={() => router.back()}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: RFValue(32) }} />
      </View>

      {/* Header card */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Star Points Ranking</Text>

        {/* Week dropdown trigger */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.dropdownTrigger}
          onPress={() => setWeekMenuOpen(true)}
        >
          <Ionicons
            name="calendar"
            size={RFValue(14)}
            color={GOLD}
            style={{ marginRight: RFValue(4) }}
          />
          <Text style={styles.dropdownPrefix}>Week:</Text>
          <Text style={styles.dropdownLabel} numberOfLines={1}>
            {selectedWeekLabel}
          </Text>
          <Ionicons
            name={weekMenuOpen ? "chevron-up" : "chevron-down"}
            size={RFValue(14)}
            color="#fff"
          />
        </TouchableOpacity>

        <Text style={styles.headerText}>
          Planet:{" "}
          <Text style={{ color: GOLD, fontWeight: "900" }}>
            {headerSubtitle}
          </Text>
        </Text>
        <Text style={styles.headerText}>
          Tournament goal:{" "}
          <Text style={{ color: GOLD, fontWeight: "900" }}>
            {TARGET_POINTS} pts
          </Text>{" "}
          over 6 days. Rank is based on{" "}
          <Text style={{ color: "#fff" }}>total points</Text>, not survival.
        </Text>

        {/* Planet / tournament filter pills */}
        {tournamentsForWeek.length > 0 && (
          <View style={styles.planetRow}>
            {tournamentsForWeek.map((t) => {
              const label =
                t.planet_name || t.tier || t.week_label || "Tournament";
              const selected = selectedTid === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setSelectedTid(t.id)}
                  activeOpacity={0.9}
                  style={[
                    styles.planetPill,
                    selected && styles.planetPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.planetPillText,
                      selected && styles.planetPillTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tier legend */}
        <View style={styles.tiersRow}>
          <View style={styles.tierPill}>
            <View style={[styles.tierDot, { backgroundColor: GOLD }]} />
            <Text style={styles.tierTxt}>≥ {TARGET_POINTS} pts → 100%</Text>
          </View>
          <View style={styles.tierPill}>
            <View style={[styles.tierDot, { backgroundColor: "#8AE1FF" }]} />
            <Text style={styles.tierTxt}>
              ≥ {TARGET_POINTS / 2} pts → 50%
            </Text>
          </View>
          <View style={styles.tierPill}>
            <View style={[styles.tierDot, { backgroundColor: "#B39DDB" }]} />
            <Text style={styles.tierTxt}>Less → 25%</Text>
          </View>
        </View>
      </View>

      {/* Week selection overlay menu */}
      {weekMenuOpen && (
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setWeekMenuOpen(false)}
          />
          <View style={styles.dropdownCard}>
            <Text style={styles.dropdownTitle}>Select tournament week</Text>
            <FlatList
              data={monthOptions}
              keyExtractor={(m) => m.key}
              renderItem={({ item: month }) => {
                const weeksInMonth = weekOptions.filter(
                  (w) => w.monthKey === month.key
                );
                if (!weeksInMonth.length) return null;

                return (
                  <View style={styles.dropdownMonthBlock}>
                    <View style={styles.dropdownMonthHeader}>
                      <Text style={styles.dropdownMonthLabel}>
                        {month.label}
                      </Text>
                    </View>
                    {weeksInMonth.map((w) => {
                      const selected = w.key === selectedWeekKey;
                      return (
                        <TouchableOpacity
                          key={w.key}
                          style={[
                            styles.dropdownWeekRow,
                            selected && styles.dropdownWeekRowSelected,
                          ]}
                          activeOpacity={0.9}
                          onPress={() => handleWeekSelect(w)}
                        >
                          <View style={styles.dropdownWeekAccent} />
                          <Text
                            style={[
                              styles.dropdownWeekText,
                              selected && styles.dropdownWeekTextSelected,
                            ]}
                          >
                            {w.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }}
            />
          </View>
        </View>
      )}

      {/* Error card */}
      {!!errorMsg && (
        <View style={styles.errorCard}>
          <Text style={{ color: "#f88", fontSize: RFValue(11) }}>
            {errorMsg}
          </Text>
        </View>
      )}

      {/* Leaderboard list */}
      <View style={styles.listWrap}>
        {loading && !rows.length ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={GOLD} size="small" />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={{ color: "#ccc", textAlign: "center" }}>
              No entries yet for this week.
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row, index) => row.entry_id ?? String(index)}
            contentContainerStyle={{
              paddingVertical: RFValue(10),
              paddingHorizontal: RFValue(12),
            }}
            renderItem={({ item, index }) => {
              const rank = index + 1;
              const username =
                item.profiles?.username ??
                `${(item.user_id || "").slice(0, 6)}…`;
              const pts = item.points_total ?? 0;
              const tier = tierLabel(pts);
              const tColor = tierColor(pts);

              return (
                <View style={styles.rowCard}>
                  <View style={styles.rowLeft}>
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankTxt}>{rank}</Text>
                    </View>
                    <View>
                      <Text style={styles.userTxt} numberOfLines={1}>
                        {username}
                      </Text>
                      <Text style={styles.statusTxt}>
                        Status: {item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    <View style={styles.pointsBox}>
                      <Text style={styles.pointsTxt}>{pts}</Text>
                      <Text style={styles.pointsLabel}>pts</Text>
                    </View>
                    <View
                      style={[
                        styles.tierBadge,
                        { borderColor: tColor, shadowColor: tColor },
                      ]}
                    >
                      <Text
                        style={[styles.tierBadgeTxt, { color: tColor }]}
                        numberOfLines={1}
                      >
                        {tier}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#050009" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topBar: {
    paddingTop: RFValue(50),
    paddingHorizontal: RFValue(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: RFValue(32),
    height: RFValue(32),
    borderRadius: RFValue(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(18),
  },

  headerCard: {
    marginTop: RFValue(14),
    marginHorizontal: RFValue(16),
    backgroundColor: CARD,
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(14),
  },
  headerTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(16),
    marginBottom: RFValue(4),
  },
  headerText: { color: "#ccc", fontSize: RFValue(11), marginBottom: RFValue(2) },

  /* week dropdown trigger */
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(5,5,20,0.9)",
    marginBottom: RFValue(8),
  },
  dropdownPrefix: {
    color: "#ccc",
    fontSize: RFValue(11),
    marginRight: RFValue(4),
  },
  dropdownLabel: {
    color: "#fff",
    fontSize: RFValue(11),
    fontWeight: "700",
    maxWidth: RFValue(180),
    marginRight: RFValue(4),
  },

  /* planet pills */
  planetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: RFValue(6),
    marginTop: RFValue(6),
    marginBottom: RFValue(4),
  },
  planetPill: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  planetPillSelected: {
    borderColor: GOLD,
    backgroundColor: "rgba(255,215,0,0.15)",
  },
  planetPillText: {
    color: "#eee",
    fontSize: RFValue(11),
    fontWeight: "700",
  },
  planetPillTextSelected: {
    color: GOLD,
  },

  /* tier legend */
  tiersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: RFValue(6),
    marginTop: RFValue(8),
  },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tierDot: {
    width: RFValue(8),
    height: RFValue(8),
    borderRadius: RFValue(99),
    marginRight: RFValue(6),
  },
  tierTxt: { color: "#eee", fontSize: RFValue(10) },

  /* dropdown overlay */
  dropdownOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: RFValue(110), // sit under header
    bottom: 0,
    alignItems: "center",
    zIndex: 50,
  },
  dropdownCard: {
    width: "88%",
    maxHeight: "55%",
    backgroundColor: "rgba(6,6,18,0.98)",
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: RFValue(12),
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  dropdownTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: RFValue(13),
    marginBottom: RFValue(8),
  },
  dropdownMonthBlock: {
    marginBottom: RFValue(8),
  },
  dropdownMonthHeader: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderRadius: RFValue(999),
    paddingVertical: RFValue(4),
    paddingHorizontal: RFValue(8),
    alignSelf: "flex-start",
    marginBottom: RFValue(4),
  },
  dropdownMonthLabel: {
    color: GOLD,
    fontWeight: "700",
    fontSize: RFValue(11),
  },
  dropdownWeekRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(6),
    paddingHorizontal: RFValue(8),
    borderRadius: RFValue(12),
    marginBottom: RFValue(4),
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dropdownWeekRowSelected: {
    backgroundColor: "rgba(255,215,0,0.15)",
  },
  dropdownWeekAccent: {
    width: RFValue(3),
    height: RFValue(16),
    borderRadius: RFValue(2),
    marginRight: RFValue(8),
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dropdownWeekText: {
    color: "#eee",
    fontSize: RFValue(11),
    fontWeight: "600",
  },
  dropdownWeekTextSelected: {
    color: GOLD,
  },

  errorCard: {
    marginTop: RFValue(10),
    marginHorizontal: RFValue(16),
    borderRadius: RFValue(10),
    borderWidth: 1,
    borderColor: "rgba(255,50,50,0.5)",
    backgroundColor: "rgba(40,0,0,0.8)",
    padding: RFValue(8),
  },

  listWrap: {
    flex: 1,
    marginTop: RFValue(10),
    marginHorizontal: RFValue(10),
    marginBottom: RFValue(16),
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: RFValue(20),
  },

  rowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: RFValue(10),
    borderRadius: RFValue(12),
    backgroundColor: "rgba(5,5,15,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: RFValue(6),
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(8),
    flexShrink: 1,
  },
  rankCircle: {
    width: RFValue(28),
    height: RFValue(28),
    borderRadius: RFValue(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(97,61,193,0.2)",
    borderWidth: 1,
    borderColor: GOLD,
  },
  rankTxt: { color: GOLD, fontWeight: "900", fontSize: RFValue(14) },
  userTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: RFValue(13),
    maxWidth: RFValue(140),
  },
  statusTxt: { color: "#aaa", fontSize: RFValue(10) },

  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(10),
  },
  pointsBox: {
    alignItems: "center",
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(10),
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pointsTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(16),
    lineHeight: RFValue(18),
  },
  pointsLabel: { color: "#aaa", fontSize: RFValue(9) },

  tierBadge: {
    maxWidth: RFValue(110),
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  tierBadgeTxt: {
    fontSize: RFValue(9),
    fontWeight: "800",
    textAlign: "center",
  },
});
