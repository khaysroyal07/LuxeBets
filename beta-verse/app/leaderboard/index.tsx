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
  start_date?: string | null;
};

type WeekOption = {
  key: string;   // internal key (week_label or start_date)
  label: string; // what we show in the UI
};

const TARGET_POINTS = 20; // X = 20 points

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

  const title = useMemo(() => "Tournament Leaderboard", []);

  /* ---------------- Fetch tournaments & build week list ---------------- */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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
          .lte("start_date", todayStr) // only past + current weeks
          .order("start_date", { ascending: false }); // newest week first

        if (error) throw error;
        if (!on) return;

        const all = (data || []) as Tournament[];
        setTournaments(all);

        // Build distinct weeks from newest to oldest
        const weeksMap = new Map<string, WeekOption>();

        for (const t of all) {
          const key = t.week_label || t.start_date || "";
          if (!key) continue;
          if (!weeksMap.has(key)) {
            // For now use week_label if present, otherwise the start_date
            weeksMap.set(key, {
              key,
              label: t.week_label || key,
            });
          }
        }

        const weeks = Array.from(weeksMap.values());
        setWeekOptions(weeks);

        // Default selected week = newest
        if (!selectedWeekKey && weeks[0]) {
          setSelectedWeekKey(weeks[0].key);
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
    // we intentionally ignore selectedWeekKey here so it doesn't refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Tournaments for the selected week ---------------- */
  const tournamentsForWeek = useMemo(() => {
    if (!selectedWeekKey) return [];
    return tournaments.filter(
      (t) => (t.week_label || t.start_date) === selectedWeekKey
    );
  }, [tournaments, selectedWeekKey]);

  // Ensure selectedTid always belongs to the current week
  useEffect(() => {
    if (!tournamentsForWeek.length) return;

    const existsInWeek = tournamentsForWeek.some((t) => t.id === selectedTid);

    if (!selectedTid || !existsInWeek) {
      setSelectedTid(tournamentsForWeek[0].id);
    }
  }, [tournamentsForWeek, selectedTid]);

  /* ---------------- Fetch leaderboard for selected tournament ---------------- */
  useEffect(() => {
    let on = true;

    (async () => {
      try {
        if (!selectedTid) {
          setRows([]);
          return;
        }

        setLoading(true);
        setErrorMsg("");

        const tId = String(selectedTid);

        let data: any[] | null = null;

        // Try with profiles join (if FK exists)
        const { data: dataWithProfiles, error: errorWithProfiles } =
          await supabase
            .from("entries")
            .select(`
              id,
              user_id,
              points_total,
              status,
              profiles:profiles!entries_user_id_fkey (
                id,
                username,
                avatar_url
              )
            `)
            .eq("tournament_id", tId)
            .order("points_total", { ascending: false });

        if (errorWithProfiles) {
          // If relationship not in schema cache yet, fall back to simple query
          if (errorWithProfiles.code === "PGRST200") {
            console.warn(
              "No FK relationship entries -> profiles in schema; falling back to basic select",
              errorWithProfiles
            );
            const { data: basicData, error: basicError } = await supabase
              .from("entries")
              .select("id, user_id, points_total, status")
              .eq("tournament_id", tId)
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
  }, [selectedTid]);

  /* ---------------- Helpers ---------------- */

  const currentWeekOption = useMemo(
    () =>
      selectedWeekKey
        ? weekOptions.find((w) => w.key === selectedWeekKey) || null
        : null,
    [weekOptions, selectedWeekKey]
  );

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

  if (loading && !selectedTid && !tournaments.length) {
    // initial load
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

        {/* Week selector row */}
        {weekOptions.length > 0 && (
          <View style={styles.weekRow}>
            <Text style={styles.headerText}>Week:</Text>
            <View style={styles.weekPillsWrap}>
              {weekOptions.map((w) => {
                const selected = w.key === selectedWeekKey;
                return (
                  <TouchableOpacity
                    key={w.key}
                    onPress={() => setSelectedWeekKey(w.key)}
                    activeOpacity={0.9}
                    style={[
                      styles.weekPill,
                      selected && styles.weekPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekPillText,
                        selected && styles.weekPillTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {w.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

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

        {/* Planet / tournament filter pills for this week */}
        {tournamentsForWeek.length > 0 && (
          <View style={styles.planetRow}>
            {tournamentsForWeek.map((t) => {
              const label =
                t.planet_name ||
                t.tier ||
                t.week_label ||
                "Tournament";

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
              No entries yet for this tournament.
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

  // week filter
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: RFValue(4),
    gap: RFValue(6),
  },
  weekPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: RFValue(6),
    flex: 1,
  },
  weekPill: {
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(3),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  weekPillSelected: {
    borderColor: GOLD,
    backgroundColor: "rgba(255,215,0,0.18)",
  },
  weekPillText: {
    color: "#eee",
    fontSize: RFValue(10),
    fontWeight: "700",
  },
  weekPillTextSelected: {
    color: GOLD,
  },

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
