// app/admin/gradegames.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const INK = "#0E0A12";
const CARD = "rgba(10,10,20,0.96)";
const BORDER = "rgba(255,255,255,0.18)";
const DIV = "rgba(255,255,255,0.10)";

type SportCode = "nba" | "nfl" | "mlb" | "nhl";

type UngradedGame = {
  league_game_id: string;
  sport: SportCode;
  game_day: string; // date
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  ungraded_ml_picks: number;
};

type ScoreInputsMap = Record<
  string,
  {
    home_score: string;
    away_score: string;
  }
>;

export default function GradeGamesScreen() {
  const router = useRouter();

  const [games, setGames] = useState<UngradedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [scoreInputs, setScoreInputs] = useState<ScoreInputsMap>({});
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<
    "all" | SportCode
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "scheduled" | "in_progress" | "final"
  >("all");
  const [onlyPendingML, setOnlyPendingML] = useState(false);

  /** ---------- LOAD DATA ---------- */

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "admin_list_ungraded_games",
      );

      if (error) {
        console.error("admin_list_ungraded_games error", error);
        Alert.alert(
          "Error",
          error.message ?? "Failed to load games.",
        );
        return;
      }

      const rows = (data || []) as UngradedGame[];

      // Initialize input state from existing scores (if any)
      const nextInputs: ScoreInputsMap = {};
      rows.forEach((g) => {
        nextInputs[g.league_game_id] = {
          home_score:
            g.home_score !== null && g.home_score !== undefined
              ? String(g.home_score)
              : "",
          away_score:
            g.away_score !== null && g.away_score !== undefined
              ? String(g.away_score)
              : "",
        };
      });

      setScoreInputs(nextInputs);
      setGames(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /** ---------- FILTER / SEARCH ---------- */

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();

    return games.filter((g) => {
      if (sportFilter !== "all" && g.sport !== sportFilter) {
        return false;
      }

      if (statusFilter !== "all") {
        const s = (g.status ?? "").toLowerCase();
        if (statusFilter === "scheduled" && s !== "scheduled") {
          return false;
        }
        if (
          statusFilter === "in_progress" &&
          s !== "in_progress"
        ) {
          return false;
        }
        if (
          statusFilter === "final" &&
          s !== "final" &&
          s !== "finished"
        ) {
          return false;
        }
      }

      if (onlyPendingML && g.ungraded_ml_picks <= 0) {
        return false;
      }

      if (!q) return true;

      const home = (g.home_team ?? "").toLowerCase();
      const away = (g.away_team ?? "").toLowerCase();
      const id = (g.league_game_id ?? "").toLowerCase();
      const day = (g.game_day ?? "").toLowerCase();

      return (
        home.includes(q) ||
        away.includes(q) ||
        id.includes(q) ||
        day.includes(q)
      );
    });
  }, [games, sportFilter, statusFilter, onlyPendingML, search]);

  /** ---------- INPUT HANDLING ---------- */

  const updateInput = (
    leagueGameId: string,
    field: "home_score" | "away_score",
    value: string,
  ) => {
    setScoreInputs((prev) => ({
      ...prev,
      [leagueGameId]: {
        home_score: prev[leagueGameId]?.home_score ?? "",
        away_score: prev[leagueGameId]?.away_score ?? "",
        [field]: value,
      },
    }));
  };

  /** ---------- CORE GRADE LOGIC (single game) ---------- */

  const gradeGameOnce = useCallback(
    async (
      game: UngradedGame,
      homeScoreNum: number,
      awayScoreNum: number,
      showAlerts: boolean,
    ) => {
      // 1) Ensure game row is set/updated
      const { error: setErr } = await supabase.rpc(
        "admin_set_game_result",
        {
          p_league_game_id: game.league_game_id,
          p_sport: game.sport,
          p_game_day: game.game_day,
          p_home_team: game.home_team ?? "",
          p_away_team: game.away_team ?? "",
          p_home_score: homeScoreNum,
          p_away_score: awayScoreNum,
        },
      );

      if (setErr) {
        console.error("admin_set_game_result error", setErr);
        if (showAlerts) {
          Alert.alert(
            "Error",
            setErr.message ?? "Failed to save game result.",
          );
        }
        throw setErr;
      }

      // 2) Grade moneyline picks for this game/day
      const { data: gradedCount, error: gradeErr } =
        await supabase.rpc("admin_grade_game_moneyline", {
          p_league_game_id: game.league_game_id,
          p_game_day: game.game_day,
          p_sport: game.sport,
        });

      if (gradeErr) {
        console.error(
          "admin_grade_game_moneyline error",
          gradeErr,
        );
        if (showAlerts) {
          Alert.alert(
            "Error",
            gradeErr.message ?? "Failed to grade picks.",
          );
        }
        throw gradeErr;
      }

      if (showAlerts) {
        Alert.alert(
          "Graded",
          `Updated ${gradedCount ?? 0} moneyline picks for this game.`,
        );
      }

      return gradedCount ?? 0;
    },
    [],
  );

  /** ---------- SINGLE GAME ACTION ---------- */

  const handleGradeGame = async (game: UngradedGame) => {
    const key = game.league_game_id;
    const inputs = scoreInputs[key] || {
      home_score: "",
      away_score: "",
    };
    const homeScoreNum = Number(inputs.home_score);
    const awayScoreNum = Number(inputs.away_score);

    if (
      Number.isNaN(homeScoreNum) ||
      Number.isNaN(awayScoreNum)
    ) {
      Alert.alert(
        "Invalid scores",
        "Please enter numeric scores for both teams.",
      );
      return;
    }

    setSavingId(game.league_game_id);
    try {
      await gradeGameOnce(
        game,
        homeScoreNum,
        awayScoreNum,
        true,
      );
      await loadData();
    } finally {
      setSavingId(null);
    }
  };

  /** ---------- BULK GRADE VISIBLE GAMES ---------- */

  const handleGradeAllVisible = () => {
    const targets = filteredGames.filter((g) => {
      const inp =
        scoreInputs[g.league_game_id] || {
          home_score: "",
          away_score: "",
        };
      const hs = Number(inp.home_score);
      const as = Number(inp.away_score);
      return !Number.isNaN(hs) && !Number.isNaN(as);
    });

    if (targets.length === 0) {
      Alert.alert(
        "Nothing to grade",
        "Enter scores for at least one visible game.",
      );
      return;
    }

    Alert.alert(
      "Grade all visible games?",
      `This will save results and grade moneyline picks for ${targets.length} game(s).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Grade all",
          style: "destructive",
          onPress: async () => {
            setBulkSaving(true);
            try {
              let totalGraded = 0;
              for (const g of targets) {
                const inp =
                  scoreInputs[g.league_game_id] || {
                    home_score: "",
                    away_score: "",
                  };
                const hs = Number(inp.home_score);
                const as = Number(inp.away_score);
                if (
                  Number.isNaN(hs) ||
                  Number.isNaN(as)
                ) {
                  continue;
                }
                const count = await gradeGameOnce(
                  g,
                  hs,
                  as,
                  false,
                );
                totalGraded += count;
              }

              Alert.alert(
                "Bulk grading complete",
                `Updated ~${totalGraded} moneyline picks across ${targets.length} game(s).`,
              );
              await loadData();
            } catch (e) {
              console.error("bulk grade error", e);
            } finally {
              setBulkSaving(false);
            }
          },
        },
      ],
    );
  };

  /** ---------- RENDER ITEM ---------- */

  const renderItem = ({ item }: { item: UngradedGame }) => {
    const inputs = scoreInputs[item.league_game_id] || {
      home_score: "",
      away_score: "",
    };
    const statusLower = (item.status ?? "").toLowerCase();
    const isScheduled = statusLower === "scheduled";

    const tagBg =
      statusLower === "final" || statusLower === "finished"
        ? "rgba(34,197,94,0.18)"
        : statusLower === "in_progress"
        ? "rgba(59,130,246,0.18)"
        : "rgba(148,163,184,0.25)";

    const tagColor =
      statusLower === "final" || statusLower === "finished"
        ? "#4ade80"
        : statusLower === "in_progress"
        ? "#60a5fa"
        : "#e5e7eb";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>
              {item.away_team ?? "??"} @{" "}
              {item.home_team ?? "??"}
            </Text>
            <Text style={styles.gameMeta}>
              {item.sport.toUpperCase()} • {item.game_day}
            </Text>
            <Text style={styles.gameMeta}>
              ID: {item.league_game_id}
            </Text>
          </View>

          <View style={styles.statusPillRow}>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: tagBg },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: tagColor },
                ]}
              >
                {item.status ?? "unknown"}
              </Text>
            </View>
            {item.ungraded_ml_picks > 0 && (
              <View style={styles.pendingPill}>
                <Ionicons
                  name="alert-circle"
                  size={12}
                  color={GOLD}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.pendingPillText}>
                  {item.ungraded_ml_picks} pending ML
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel}>
              {item.home_team ?? "Home"} score
            </Text>
            <TextInput
              style={styles.scoreInput}
              keyboardType="number-pad"
              value={inputs.home_score}
              onChangeText={(txt) =>
                updateInput(
                  item.league_game_id,
                  "home_score",
                  txt,
                )
              }
              placeholder={
                item.home_score !== null
                  ? String(item.home_score)
                  : isScheduled
                  ? "Final home pts"
                  : "e.g. 110"
              }
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>

          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel}>
              {item.away_team ?? "Away"} score
            </Text>
            <TextInput
              style={styles.scoreInput}
              keyboardType="number-pad"
              value={inputs.away_score}
              onChangeText={(txt) =>
                updateInput(
                  item.league_game_id,
                  "away_score",
                  txt,
                )
              }
              placeholder={
                item.away_score !== null
                  ? String(item.away_score)
                  : isScheduled
                  ? "Final away pts"
                  : "e.g. 98"
              }
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.gradeButton,
            savingId === item.league_game_id && {
              opacity: 0.6,
            },
          ]}
          disabled={savingId === item.league_game_id}
          onPress={() => handleGradeGame(item)}
        >
          {savingId === item.league_game_id ? (
            <ActivityIndicator />
          ) : (
            <>
              <Ionicons
                name="checkmark-done"
                size={18}
                color="#000"
              />
              <Text style={styles.gradeButtonText}>
                Save & Grade ML Picks
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  /** ---------- RENDER ---------- */

  return (
    <ImageBackground
      source={BG}
      style={styles.bg}
      imageStyle={{ opacity: 0.55 }}
    >
      <View style={styles.overlay}>
        {/* Header / Top Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              Admin · Grade Games
            </Text>
            <Text style={styles.headerSub}>
              Edit scores & grade moneyline picks
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Filters */}
        <View style={styles.filtersBox}>
          {/* Sport filter row */}
          <View style={styles.filterRow}>
            {[
              { key: "all", label: "All" },
              { key: "nba", label: "NBA" },
              { key: "nfl", label: "NFL" },
              { key: "mlb", label: "MLB" },
              { key: "nhl", label: "NHL" },
            ].map((f) => {
              const selected =
                sportFilter ===
                (f.key as "all" | SportCode);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                  ]}
                  onPress={() =>
                    setSportFilter(
                      f.key as "all" | SportCode,
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected &&
                        styles.filterChipTextSelected,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Status + pending row */}
          <View style={styles.filterRow}>
            {[
              { key: "all", label: "Any status" },
              { key: "scheduled", label: "Scheduled" },
              { key: "in_progress", label: "In progress" },
              { key: "final", label: "Final" },
            ].map((f) => {
              const selected =
                statusFilter ===
                (f.key as typeof statusFilter);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterChipSmall,
                    selected &&
                      styles.filterChipSelected,
                  ]}
                  onPress={() =>
                    setStatusFilter(
                      f.key as typeof statusFilter,
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filterChipTextSmall,
                      selected &&
                        styles.filterChipTextSelected,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.pendingChip,
                onlyPendingML &&
                  styles.pendingChipActive,
              ]}
              onPress={() =>
                setOnlyPendingML((prev) => !prev)
              }
              activeOpacity={0.9}
            >
              <Ionicons
                name="funnel-outline"
                size={12}
                color={
                  onlyPendingML ? INK : GOLD
                }
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.pendingChipText,
                  onlyPendingML && {
                    color: INK,
                  },
                ]}
              >
                Pending ML only
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search + bulk action row */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons
                name="search-outline"
                size={16}
                color="rgba(255,255,255,0.7)"
                style={{ marginRight: 6 }}
              />
              <TextInput
                placeholder="Search by team, game id, or date"
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.bulkBtn,
                (bulkSaving ||
                  filteredGames.length === 0) && {
                  opacity: 0.55,
                },
              ]}
              disabled={
                bulkSaving || filteredGames.length === 0
              }
              onPress={handleGradeAllVisible}
            >
              {bulkSaving ? (
                <ActivityIndicator
                  size="small"
                  color="#000"
                />
              ) : (
                <>
                  <Ionicons
                    name="flash-outline"
                    size={16}
                    color="#000"
                  />
                  <Text style={styles.bulkBtnText}>
                    Grade all
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator
              size="large"
              color={GOLD}
            />
            <Text style={styles.loadingText}>
              Loading games with pending picks...
            </Text>
          </View>
        ) : filteredGames.length === 0 ? (
          <View style={styles.center}>
            <Ionicons
              name="checkmark-circle"
              size={40}
              color={GOLD}
            />
            <Text style={styles.emptyText}>
              No games match your filters.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredGames}
            keyExtractor={(item) =>
              `${item.league_game_id}-${item.game_day}-${item.sport}`
            }
            renderItem={renderItem}
            contentContainerStyle={{
              paddingBottom: 40,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#fff"
              />
            }
          />
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: INK,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(3,3,10,0.8)",
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "rgba(10,10,20,0.9)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: RFValue(15),
    fontFamily: "PoppinsSemiBold",
  },
  headerSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(11),
    fontFamily: "Poppins",
  },

  filtersBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(8,8,18,0.96)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(12,12,28,0.9)",
    marginRight: 6,
    marginBottom: 4,
  },
  filterChipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(12,12,28,0.9)",
    marginRight: 6,
    marginBottom: 4,
  },
  filterChipSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  filterChipText: {
    color: "#fff",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(10),
  },
  filterChipTextSmall: {
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: RFValue(9.5),
  },
  filterChipTextSelected: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
  },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.8)",
    backgroundColor: "rgba(12,12,28,0.9)",
    marginLeft: "auto",
  },
  pendingChipActive: {
    backgroundColor: GOLD,
  },
  pendingChipText: {
    color: GOLD,
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(9.5),
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(5,5,15,0.95)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: RFValue(11.5),
  },
  bulkBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: GOLD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  bulkBtnText: {
    color: "#000",
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(11),
    marginLeft: 4,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#fff",
    fontSize: RFValue(12),
    fontFamily: "Poppins",
  },
  emptyText: {
    marginTop: 8,
    color: "#fff",
    fontSize: RFValue(13),
    textAlign: "center",
    fontFamily: "Poppins",
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  gameTitle: {
    color: "#fff",
    fontSize: RFValue(13.5),
    fontFamily: "PoppinsSemiBold",
  },
  gameMeta: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10.5),
    fontFamily: "Poppins",
  },
  statusPillRow: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 4,
  },
  statusPillText: {
    fontSize: RFValue(9.5),
    fontFamily: "PoppinsMedium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(250,204,21,0.08)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pendingPillText: {
    color: GOLD,
    fontSize: RFValue(9.5),
    fontFamily: "Poppins",
  },

  scoreRow: {
    flexDirection: "row",
    marginTop: 6,
    marginBottom: 6,
  },
  scoreCol: {
    flex: 1,
    marginRight: 6,
  },
  scoreLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: RFValue(10.5),
    marginBottom: 3,
    fontFamily: "Poppins",
  },
  scoreInput: {
    borderWidth: 1,
    borderColor: DIV,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#fff",
    fontSize: RFValue(12),
    fontFamily: "PoppinsMedium",
    backgroundColor: "rgba(6,6,18,0.96)",
  },
  gradeButton: {
    marginTop: 6,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  gradeButtonText: {
    color: "#000",
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(11.5),
    marginLeft: 6,
  },
});
