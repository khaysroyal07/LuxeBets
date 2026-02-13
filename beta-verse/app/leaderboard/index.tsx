// app/leaderboard/index.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
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
  row_key: string;
  tournament_id: string;
  user_id: string;
  username: string;
  points_total: number;
  status: string;
  rank?: number | null;
};

type Tournament = {
  id: string;
  planet_name?: string | null;
  tier?: string | null;
  entry_fee_cents?: number | null;
  status?: string | null;
  week_label?: string | null;
  start_date?: string | null;
  join_open_at?: string | null;
  join_close_at?: string | null;
};

type WeekOption = {
  key: string; // "YYYY-MM-DD" (Sunday local)
  label: string;
  monthKey: string;
  monthLabel: string;
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

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const medalForRank = (rank: number) => {
  if (rank === 1) return "trophy";
  if (rank === 2) return "medal";
  if (rank === 3) return "ribbon";
  return null;
};

const medalColor = (rank: number) => {
  if (rank === 1) return GOLD;
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#CD7F32";
  return "#fff";
};

/** ---- DATE HELPERS ---- */
const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDateOnlyLocal = (iso: string) => new Date(`${iso}T12:00:00`);

const parseTsToLocalDateOnly = (ts: string) => {
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return null;
  return toLocalISO(new Date(ms));
};

// ✅ IMPORTANT: Week key should be SUNDAY (join_open_at) in LOCAL DATE
const weekKeyForTournament = (t: Tournament): string | null => {
  // join_open_at is the real “week start”
  if (t.join_open_at) {
    const k = parseTsToLocalDateOnly(t.join_open_at);
    if (k) return k;
  }
  // fallback
  if (t.start_date) return String(t.start_date).slice(0, 10);
  return null;
};

export default function LeaderboardScreen() {
  const router = useRouter();

  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTid, setSelectedTid] = useState<string | null>(null);

  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  const [weekMenuOpen, setWeekMenuOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState<boolean | null>(null);

  const [joinedTournamentIds, setJoinedTournamentIds] = useState<Set<string>>(new Set());

  const [showStanding, setShowStanding] = useState(true);
  const [tieModalOpen, setTieModalOpen] = useState(false);

  /* ---------------------- AUTH ---------------------- */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!on) return;
        if (error || !data.user) setUserId(null);
        else setUserId(data.user.id);
      } catch {
        if (on) setUserId(null);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  /* ---------------------- TOURNAMENTS + WEEKS ---------------------- */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setBootLoading(true);

        // ✅ don’t filter by start_date anymore (that’s why you see Sat)
        // Just load recent tournaments and build week list from join_open_at
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
              created_at,
              join_open_at,
              join_close_at
            `
          )
          .order("join_open_at", { ascending: false, nullsFirst: false });

        if (error) throw error;
        if (!on) return;

        const all = (data || []) as Tournament[];
        setTournaments(all);

        const weeksMap = new Map<string, WeekOption>();

        for (const t of all) {
          const weekKey = weekKeyForTournament(t);
          if (!weekKey) continue;
          if (weeksMap.has(weekKey)) continue;

          const dt = parseDateOnlyLocal(weekKey);
          const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
          const monthLabel = dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          weeksMap.set(weekKey, { key: weekKey, label, monthKey, monthLabel });
        }

        const weeks = Array.from(weeksMap.values()).sort((a, b) => b.key.localeCompare(a.key));
        setWeekOptions(weeks);

        if (weeks[0]) {
          setSelectedWeekKey(weeks[0].key);

          const weekTournaments = all.filter((t) => weekKeyForTournament(t) === weeks[0].key);
          if (weekTournaments[0]) setSelectedTid(weekTournaments[0].id);
        }
      } catch (e: any) {
        console.warn("tournaments fetch error", e);
        setErrorMsg(e?.message || "Failed to load tournaments.");
      } finally {
        if (on) setBootLoading(false);
      }
    })();

    return () => {
      on = false;
    };
  }, []);

  /* ---------------------- DERIVED LISTS ---------------------- */
  const tournamentsForWeek = useMemo(() => {
    if (!selectedWeekKey) return [];
    return tournaments.filter((t) => weekKeyForTournament(t) === selectedWeekKey);
  }, [tournaments, selectedWeekKey]);

  const weekTournamentIds = useMemo(() => tournamentsForWeek.map((t) => t.id), [tournamentsForWeek]);

  const monthOptions: MonthOption[] = useMemo(() => {
    const map = new Map<string, MonthOption>();
    for (const w of weekOptions) {
      if (!map.has(w.monthKey)) map.set(w.monthKey, { key: w.monthKey, label: w.monthLabel });
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [weekOptions]);

  const selectedWeek = useMemo(
    () => weekOptions.find((w) => w.key === selectedWeekKey) || null,
    [weekOptions, selectedWeekKey]
  );

  const selectedWeekLabel = useMemo(() => {
    return selectedWeek ? `${selectedWeek.label} (${selectedWeek.monthLabel})` : "Select week";
  }, [selectedWeek]);

  const currentTournament = useMemo(() => {
    return tournamentsForWeek.find((t) => t.id === selectedTid) || tournamentsForWeek[0] || null;
  }, [tournamentsForWeek, selectedTid]);

  const headerSubtitle = useMemo(() => {
    return currentTournament
      ? currentTournament.planet_name || currentTournament.tier || "Current Tournament"
      : "Current Tournament";
  }, [currentTournament]);

  const isOpenNow = useMemo(() => {
    if (!currentTournament?.join_open_at) return true;
    const ms = new Date(currentTournament.join_open_at).getTime();
    return Number.isFinite(ms) ? Date.now() >= ms : true;
  }, [currentTournament?.join_open_at]);

  /* ---------------------- WEEK MENU SELECT ---------------------- */
  const handleWeekSelect = useCallback(
    (week: WeekOption) => {
      setSelectedWeekKey(week.key);
      setWeekMenuOpen(false);

      const weekTournaments = tournaments.filter((t) => weekKeyForTournament(t) === week.key);
      if (weekTournaments[0]) setSelectedTid(weekTournaments[0].id);
      else {
        setSelectedTid(null);
        setRows([]);
        setHasJoined(null);
        setJoinedTournamentIds(new Set());
      }
    },
    [tournaments]
  );

  useEffect(() => {
    if (!tournamentsForWeek.length) return;
    const existsInWeek = tournamentsForWeek.some((t) => t.id === selectedTid);
    if (!selectedTid || !existsInWeek) setSelectedTid(tournamentsForWeek[0].id);
  }, [tournamentsForWeek, selectedTid]);

  /* ---------------------- JOINED FOR WEEK (ENTRIES ONLY) ---------------------- */
  const fetchJoinedForWeek = useCallback(async () => {
    if (!userId || !selectedWeekKey || weekTournamentIds.length === 0) {
      setJoinedTournamentIds(new Set());
      return;
    }

    try {
      const enRes = await supabase
        .from("entries")
        .select("tournament_id")
        .eq("user_id", userId)
        .in("tournament_id", weekTournamentIds);

      if (enRes.error) throw enRes.error;

      const s = new Set<string>((enRes.data || []).map((r: any) => r.tournament_id));
      setJoinedTournamentIds(s);

      if (s.size > 0 && selectedTid && !s.has(selectedTid)) {
        setSelectedTid(Array.from(s)[0]);
      }
    } catch (e: any) {
      console.warn("fetchJoinedForWeek error", e);
      setJoinedTournamentIds(new Set());
    }
  }, [userId, selectedWeekKey, weekTournamentIds, selectedTid]);

  useEffect(() => {
    fetchJoinedForWeek();
  }, [fetchJoinedForWeek]);

  /* ---------------------- LEADERBOARD FETCH ---------------------- */
  const fetchLeaderboard = useCallback(
    async (opts?: { refreshing?: boolean }) => {
      const isRefreshing = !!opts?.refreshing;

      if (!selectedWeekKey || weekTournamentIds.length === 0) {
        setRows([]);
        setHasJoined(null);
        return;
      }

      if (!userId) {
        setRows([]);
        setHasJoined(false);
        return;
      }

      const idsFilter =
        selectedTid && weekTournamentIds.includes(selectedTid) ? [selectedTid] : weekTournamentIds;

      try {
        setErrorMsg("");
        if (isRefreshing) setRefreshing(true);
        else setLoading(true);

        const joinedAny = joinedTournamentIds.size > 0;
        if (!joinedAny) {
          setHasJoined(false);
          setRows([]);
          return;
        }

        setHasJoined(true);

        if (!isOpenNow) {
          setRows([]);
          return;
        }

        const { data, error } = await supabase.rpc("get_tournament_leaderboard", {
          p_tournament_ids: idsFilter,
        });

        if (error) throw error;

        const mapped: LeaderRow[] =
          (data || []).map((row: any) => {
            const tid = String(row.tournament_id || "");
            const uid = String(row.user_id || "");
            const rk = String(row.row_key || `${tid}:${uid}`);

            return {
              row_key: rk,
              tournament_id: tid,
              user_id: uid,
              username: row.username || `${uid.slice(0, 6)}…`,
              points_total: row.points_total ?? 0,
              status: row.status ?? "active",
              rank: row.rank ?? null,
            };
          }) ?? [];

        setRows(mapped);
      } catch (e: any) {
        console.warn("leaderboard fetch error", e);
        setErrorMsg(e?.message || "Failed to load leaderboard.");
        setRows([]);
        setHasJoined(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedWeekKey, weekTournamentIds, selectedTid, userId, joinedTournamentIds, isOpenNow]
  );

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const onRefresh = useCallback(() => {
    fetchJoinedForWeek()
      .catch(() => null)
      .finally(() => fetchLeaderboard({ refreshing: true }));
  }, [fetchJoinedForWeek, fetchLeaderboard]);

  /* ---------------------- STANDING + PODIUM ---------------------- */
  const myRow = useMemo(() => rows.find((r) => r.user_id === userId) || null, [rows, userId]);
  const myRank = useMemo(() => myRow?.rank ?? null, [myRow]);
  const myPts = useMemo(() => myRow?.points_total ?? 0, [myRow]);

  const nextTierTarget = useMemo(() => {
    if (myPts >= TARGET_POINTS) return TARGET_POINTS;
    if (myPts >= TARGET_POINTS / 2) return TARGET_POINTS;
    return TARGET_POINTS / 2;
  }, [myPts]);

  const nextTierLabel = useMemo(() => {
    if (myPts >= TARGET_POINTS) return "Max tier reached";
    if (myPts >= TARGET_POINTS / 2) return "Next tier: 100%";
    return "Next tier: 50%";
  }, [myPts]);

  const ptsToNext = useMemo(() => {
    if (myPts >= TARGET_POINTS) return 0;
    return Math.max(0, Math.ceil(nextTierTarget - myPts));
  }, [myPts, nextTierTarget]);

  const progress = useMemo(() => {
    if (myPts >= TARGET_POINTS) return 1;
    return clamp01(myPts / nextTierTarget);
  }, [myPts, nextTierTarget]);

  const topScore = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((m, r) => Math.max(m, r.points_total ?? 0), 0);
  }, [rows]);

  const topTied = useMemo(() => {
    if (topScore <= 0) return [];
    return [...rows]
      .filter((r) => (r.points_total ?? 0) === topScore)
      .sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  }, [rows, topScore]);

  const showTopPlayersCard = useMemo(() => topScore > 0, [topScore]);

  const podium = useMemo(() => {
    if (!rows.length) return [];
    if (topScore <= 0) return [];

    const rankedTop = rows
      .filter((r) => typeof r.rank === "number" && (r.rank as number) > 0 && (r.rank as number) <= 3)
      .sort((a, b) => (a.rank as number) - (b.rank as number));

    if (rankedTop.length) return rankedTop;

    return [...rows]
      .filter((r) => (r.points_total ?? 0) > 0)
      .sort((a, b) => {
        const dp = (b.points_total ?? 0) - (a.points_total ?? 0);
        if (dp !== 0) return dp;
        return (a.username || "").localeCompare(b.username || "");
      })
      .slice(0, 3);
  }, [rows, topScore]);

  const selectedPlanetJoined = useMemo(() => {
    if (!selectedTid) return false;
    return joinedTournamentIds.has(selectedTid);
  }, [joinedTournamentIds, selectedTid]);

  const isBootScreen = useMemo(() => {
    return bootLoading && !selectedWeekKey && tournaments.length === 0;
  }, [bootLoading, selectedWeekKey, tournaments.length]);

  /* ---------------------- RENDER ---------------------- */
  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      <Modal
        visible={tieModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTieModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTieModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Tie for #1</Text>
              <TouchableOpacity onPress={() => setTieModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={RFValue(16)} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Sorted A–Z</Text>

            <View style={{ marginTop: RFValue(8) }}>
              {topTied.map((p) => (
                <View key={p.row_key} style={styles.modalRow}>
                  <Text style={styles.modalName} numberOfLines={1}>
                    {p.username || `${(p.user_id || "").slice(0, 6)}…`}
                  </Text>
                  <Text style={styles.modalPts}>{p.points_total ?? 0} pts</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {isBootScreen ? (
        <View style={styles.center}>
          <ActivityIndicator color={PURPLE} size="large" />
        </View>
      ) : (
        <>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.9} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Tournament Leaderboard</Text>
            <View style={{ width: RFValue(32) }} />
          </View>

          <View style={styles.headerCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.headerTitle}>Star Points Ranking</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setShowStanding((s) => !s)}
                style={styles.collapseBtn}
              >
                <Ionicons name={showStanding ? "chevron-up" : "chevron-down"} size={RFValue(14)} color="#fff" />
                <Text style={styles.collapseTxt}>{showStanding ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.dropdownTrigger}
              onPress={() => setWeekMenuOpen(true)}
            >
              <Ionicons name="calendar" size={RFValue(14)} color={GOLD} style={{ marginRight: RFValue(4) }} />
              <Text style={styles.dropdownPrefix}>Week:</Text>
              <Text style={styles.dropdownLabel} numberOfLines={1}>
                {selectedWeekLabel}
              </Text>
              <Ionicons name={weekMenuOpen ? "chevron-up" : "chevron-down"} size={RFValue(14)} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerText}>
              Planet: <Text style={{ color: GOLD, fontWeight: "900" }}>{headerSubtitle}</Text>
            </Text>

            <Text style={styles.headerText}>
              Goal:{" "}
              <Text style={{ color: GOLD, fontWeight: "900" }}>{TARGET_POINTS} pts</Text> over 6 days. Ranking is
              based on <Text style={{ color: "#fff" }}>total points</Text>.
            </Text>

            {tournamentsForWeek.length > 0 && (
              <View style={styles.planetRow}>
                {tournamentsForWeek.map((t) => {
                  const label = (t.planet_name || t.tier || t.week_label || "Tournament").toLowerCase();
                  const selected = selectedTid === t.id;
                  const joined = joinedTournamentIds.has(t.id);

                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => setSelectedTid(t.id)}
                      activeOpacity={0.9}
                      style={[
                        styles.planetPill,
                        selected && styles.planetPillSelected,
                        joined && { borderColor: "rgba(255,215,0,0.45)" },
                      ]}
                    >
                      <Text style={[styles.planetPillText, selected && styles.planetPillTextSelected]} numberOfLines={1}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.tiersRow}>
              <View style={styles.tierPill}>
                <View style={[styles.tierDot, { backgroundColor: GOLD }]} />
                <Text style={styles.tierTxt}>≥ {TARGET_POINTS} pts → 100%</Text>
              </View>
              <View style={styles.tierPill}>
                <View style={[styles.tierDot, { backgroundColor: "#8AE1FF" }]} />
                <Text style={styles.tierTxt}>≥ {TARGET_POINTS / 2} pts → 50%</Text>
              </View>
              <View style={styles.tierPill}>
                <View style={[styles.tierDot, { backgroundColor: "#B39DDB" }]} />
                <Text style={styles.tierTxt}>Less → 25%</Text>
              </View>
            </View>
          </View>

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
                    const weeksInMonth = weekOptions.filter((w) => w.monthKey === month.key);
                    if (!weeksInMonth.length) return null;

                    return (
                      <View style={styles.dropdownMonthBlock}>
                        <View style={styles.dropdownMonthHeader}>
                          <Text style={styles.dropdownMonthLabel}>{month.label}</Text>
                        </View>
                        {weeksInMonth.map((w) => {
                          const selected = w.key === selectedWeekKey;
                          return (
                            <TouchableOpacity
                              key={w.key}
                              style={[styles.dropdownWeekRow, selected && styles.dropdownWeekRowSelected]}
                              activeOpacity={0.9}
                              onPress={() => handleWeekSelect(w)}
                            >
                              <View style={styles.dropdownWeekAccent} />
                              <Text style={[styles.dropdownWeekText, selected && styles.dropdownWeekTextSelected]}>
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

          {!!errorMsg && (
            <View style={styles.errorCard}>
              <Text style={{ color: "#f88", fontSize: RFValue(11) }}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.listWrap}>
            {hasJoined === false ? (
              <View style={styles.emptyWrap}>
                <Text style={{ color: "#eee", textAlign: "center", fontSize: RFValue(12) }}>
                  You must <Text style={{ color: GOLD, fontWeight: "900" }}>join</Text> this tournament week to view the leaderboard.
                </Text>
              </View>
            ) : loading && !rows.length ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={GOLD} size="small" />
              </View>
            ) : rows.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={{ color: "#ccc", textAlign: "center" }}>
                  {selectedPlanetJoined ? "No leaderboard rows yet." : "You didn't join this planet. Tap the planet you joined."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(row, idx) => row.row_key || `${row.tournament_id}:${row.user_id}:${idx}`}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
                ListHeaderComponent={
                  <View style={{ paddingHorizontal: RFValue(12), paddingTop: RFValue(12) }}>
                    {showStanding && (
                      <>
                        <View style={styles.meCard}>
                          <View style={styles.meHeaderRow}>
                            <View>
                              <Text style={styles.meTitle}>Your Standing</Text>
                              <Text style={styles.meSub}>
                                {myRank ? `Rank #${myRank} • ${myPts} pts` : `${myPts} pts`}
                              </Text>
                            </View>
                            <View style={styles.meRight}>
                              <View style={[styles.meTierPill, { borderColor: tierColor(myPts) }]}>
                                <Text style={[styles.meTierTxt, { color: tierColor(myPts) }]} numberOfLines={1}>
                                  {tierLabel(myPts)}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View style={styles.progressRow}>
                            <View style={styles.progressTrack}>
                              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                            </View>
                            <Text style={styles.progressTxt}>
                              {myPts >= TARGET_POINTS ? "Goal complete 🎉" : `${ptsToNext} pts to next tier • ${nextTierLabel}`}
                            </Text>
                          </View>
                        </View>

                        {showTopPlayersCard && (
                          <View style={styles.podiumCard}>
                            <View style={styles.podiumHeaderRow}>
                              <Text style={styles.podiumTitle}>Top Players</Text>

                              {topTied.length > 1 && (
                                <TouchableOpacity
                                  onPress={() => setTieModalOpen(true)}
                                  activeOpacity={0.9}
                                  style={styles.tiePill}
                                >
                                  <Ionicons name="alert-circle" size={RFValue(12)} color={GOLD} />
                                  <Text style={styles.tieTxt}>Tie • {topTied.length}</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={styles.podiumRow}>
                              {podium.map((p, i) => {
                                const rank = p.rank ?? i + 1;
                                const icon = medalForRank(rank) || "trophy";
                                const c = medalColor(rank);
                                const name = p.username || `${(p.user_id || "").slice(0, 6)}…`;

                                return (
                                  <View key={p.row_key} style={styles.podiumItem}>
                                    <View style={[styles.podiumIconWrap, { borderColor: c }]}>
                                      <Ionicons name={icon as any} size={RFValue(14)} color={c} />
                                    </View>
                                    <Text style={styles.podiumRank}>#{rank}</Text>
                                    <Text style={styles.podiumName} numberOfLines={1}>
                                      {name}
                                    </Text>
                                    <Text style={styles.podiumPts}>{p.points_total ?? 0} pts</Text>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        )}
                      </>
                    )}

                    <Text style={styles.sectionLabel}>Leaderboard</Text>
                  </View>
                }
                contentContainerStyle={{
                  paddingBottom: RFValue(14),
                  paddingHorizontal: RFValue(12),
                }}
                renderItem={({ item, index }) => {
                  const pts = item.points_total ?? 0;
                  const rank = item.rank ?? (pts > 0 ? index + 1 : null);

                  const username = item.username || `${(item.user_id || "").slice(0, 6)}…`;
                  const tier = tierLabel(pts);
                  const tColor = tierColor(pts);

                  const isMe = !!userId && item.user_id === userId;
                  const isTop3 = !!rank && rank <= 3;

                  return (
                    <View style={[styles.rowCard, isTop3 && styles.rowCardTop, isMe && styles.rowCardMe]}>
                      <View style={styles.rowLeft}>
                        <View
                          style={[
                            styles.rankCircle,
                            isTop3 && rank ? { borderColor: medalColor(rank) } : null,
                            isMe ? { backgroundColor: "rgba(255,215,0,0.12)", borderColor: GOLD } : null,
                          ]}
                        >
                          <Text style={[styles.rankTxt, isTop3 && rank ? { color: medalColor(rank) } : null]}>
                            {rank ? String(rank) : "—"}
                          </Text>
                        </View>

                        <View style={{ flexShrink: 1 }}>
                          <Text style={styles.userTxt} numberOfLines={1}>
                            {isMe ? "You" : username}
                            {isMe ? <Text style={{ color: GOLD }}> ★</Text> : null}
                          </Text>
                          <Text style={styles.statusTxt}>Status: {item.status}</Text>
                        </View>
                      </View>

                      <View style={styles.rowRight}>
                        <View style={styles.pointsBox}>
                          <Text style={styles.pointsTxt}>{pts}</Text>
                          <Text style={styles.pointsLabel}>pts</Text>
                        </View>
                        <View style={[styles.tierBadge, { borderColor: tColor, shadowColor: tColor }]}>
                          <Text style={[styles.tierBadgeTxt, { color: tColor }]} numberOfLines={1}>
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
        </>
      )}
    </ImageBackground>
  );
}

/* styles: unchanged from your file + small additions used above */
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
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(18) },

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

  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(6),
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  collapseTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(10) },

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
  dropdownPrefix: { color: "#ccc", fontSize: RFValue(11), marginRight: RFValue(4) },
  dropdownLabel: {
    color: "#fff",
    fontSize: RFValue(11),
    fontWeight: "700",
    maxWidth: RFValue(180),
    marginRight: RFValue(4),
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
  planetPillSelected: { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.15)" },
  planetPillText: { color: "#eee", fontSize: RFValue(11), fontWeight: "700" },
  planetPillTextSelected: { color: GOLD },

  tiersRow: { flexDirection: "row", flexWrap: "wrap", gap: RFValue(6), marginTop: RFValue(8) },
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

  dropdownOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: RFValue(110),
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
  dropdownTitle: { color: "#fff", fontWeight: "800", fontSize: RFValue(13), marginBottom: RFValue(8) },
  dropdownMonthBlock: { marginBottom: RFValue(8) },
  dropdownMonthHeader: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderRadius: RFValue(999),
    paddingVertical: RFValue(4),
    paddingHorizontal: RFValue(8),
    alignSelf: "flex-start",
    marginBottom: RFValue(4),
  },
  dropdownMonthLabel: { color: GOLD, fontWeight: "700", fontSize: RFValue(11) },
  dropdownWeekRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(6),
    paddingHorizontal: RFValue(8),
    borderRadius: RFValue(12),
    marginBottom: RFValue(4),
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dropdownWeekRowSelected: { backgroundColor: "rgba(255,215,0,0.15)" },
  dropdownWeekAccent: {
    width: RFValue(3),
    height: RFValue(16),
    borderRadius: RFValue(2),
    marginRight: RFValue(8),
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dropdownWeekText: { color: "#eee", fontSize: RFValue(11), fontWeight: "600" },
  dropdownWeekTextSelected: { color: GOLD },

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
    overflow: "hidden",
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: RFValue(20) },

  sectionLabel: {
    marginTop: RFValue(10),
    marginBottom: RFValue(8),
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    fontSize: RFValue(11),
    letterSpacing: 0.4,
  },

  meCard: {
    backgroundColor: "rgba(10,10,22,0.95)",
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.22)",
    padding: RFValue(12),
    shadowColor: GOLD,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  meHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: RFValue(10) },
  meTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(14) },
  meSub: { color: "#cfcfcf", marginTop: RFValue(2), fontSize: RFValue(11), fontWeight: "600" },
  meRight: { alignItems: "flex-end", maxWidth: RFValue(150) },
  meTierPill: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  meTierTxt: { fontWeight: "900", fontSize: RFValue(10) },

  progressRow: { marginTop: RFValue(10) },
  progressTrack: {
    height: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  progressFill: { height: "100%", borderRadius: RFValue(999), backgroundColor: "rgba(255,215,0,0.7)" },
  progressTxt: {
    marginTop: RFValue(6),
    color: "rgba(255,255,255,0.75)",
    fontSize: RFValue(10),
    fontWeight: "700",
  },

  podiumCard: {
    marginTop: RFValue(10),
    backgroundColor: "rgba(8,8,18,0.92)",
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: RFValue(12),
  },
  podiumHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  podiumTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },
  podiumRow: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(10) },
  podiumItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: RFValue(14),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: RFValue(10),
    paddingHorizontal: RFValue(8),
    alignItems: "center",
  },
  podiumIconWrap: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(10),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    marginBottom: RFValue(6),
  },
  podiumRank: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },
  podiumName: { color: "#eee", fontWeight: "800", fontSize: RFValue(10), marginTop: RFValue(2) },
  podiumPts: { color: "rgba(255,255,255,0.75)", fontSize: RFValue(10), marginTop: RFValue(2), fontWeight: "700" },

  tiePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(6),
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    backgroundColor: "rgba(255,215,0,0.10)",
  },
  tieTxt: { color: GOLD, fontWeight: "900", fontSize: RFValue(10) },

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
  rowCardTop: { borderColor: "rgba(255,215,0,0.18)", backgroundColor: "rgba(12,10,24,0.95)" },
  rowCardMe: {
    borderColor: "rgba(255,215,0,0.65)",
    backgroundColor: "rgba(20,16,30,0.98)",
    shadowColor: GOLD,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },

  rowLeft: { flexDirection: "row", alignItems: "center", gap: RFValue(8), flexShrink: 1 },
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
  userTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(13), maxWidth: RFValue(160) },
  statusTxt: { color: "#aaa", fontSize: RFValue(10) },

  rowRight: { flexDirection: "row", alignItems: "center", gap: RFValue(10) },
  pointsBox: {
    alignItems: "center",
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(10),
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pointsTxt: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), lineHeight: RFValue(18) },
  pointsLabel: { color: "#aaa", fontSize: RFValue(9) },

  tierBadge: {
    maxWidth: RFValue(120),
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  tierBadgeTxt: { fontSize: RFValue(9), fontWeight: "800", textAlign: "center" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: RFValue(18),
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(10,10,22,0.98)",
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: RFValue(14),
  },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(14) },
  modalSub: { color: "rgba(255,255,255,0.7)", marginTop: RFValue(4), fontSize: RFValue(10), fontWeight: "700" },
  modalCloseBtn: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(10),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: RFValue(10),
    paddingHorizontal: RFValue(10),
    borderRadius: RFValue(12),
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: RFValue(8),
  },
  modalName: { color: "#fff", fontWeight: "800", fontSize: RFValue(12), flexShrink: 1, paddingRight: RFValue(10) },
  modalPts: { color: GOLD, fontWeight: "900", fontSize: RFValue(12) },
});
