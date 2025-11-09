import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
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
    username?: string | null;
    avatar_url?: string | null;
  } | null;
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
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const title = useMemo(
    () => "Tournament Leaderboard",
    []
  );

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        if (!tournamentId) {
          throw new Error("Missing tournamentId in route params.");
        }

        const { data, error } = await supabase
          .from("entries")
          .select(
            `
            id,
            user_id,
            points_total,
            status,
            profiles:profiles!entries_user_id_fkey (
              username,
              avatar_url
            )
          `
          )
          .eq("tournament_id", tournamentId)
          .order("points_total", { ascending: false });

        if (error) throw error;

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
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [tournamentId]);

  if (loading) {
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
        <Text style={styles.headerText}>
          Tournament goal:{" "}
          <Text style={{ color: GOLD, fontWeight: "900" }}>
            {TARGET_POINTS} pts
          </Text>{" "}
          over 6 days. Rank is based on{" "}
          <Text style={{ color: "#fff" }}>total points</Text>, not survival.
        </Text>

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

      {/* Error */}
      {!!errorMsg && (
        <View style={styles.errorCard}>
          <Text style={{ color: "#f88", fontSize: RFValue(11) }}>
            {errorMsg}
          </Text>
        </View>
      )}

      {/* Leaderboard list */}
      <View style={styles.listWrap}>
        {rows.length === 0 ? (
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
                `${item.user_id.slice(0, 6)}…`;
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
                        style={[
                          styles.tierBadgeTxt,
                          { color: tColor },
                        ]}
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
    marginBottom: RFValue(6),
  },
  headerText: { color: "#ccc", fontSize: RFValue(11) },

  tiersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: RFValue(6),
    marginTop: RFValue(10),
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
