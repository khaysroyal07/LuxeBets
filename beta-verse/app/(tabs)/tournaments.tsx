// app/(tabs)/tournaments/index.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

import EntriesModal from "../entries/EntriesModal";
import GalaxyAlert from "@/components/GalaxyAlert";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.96)";

type TierKey = "mars" | "jupiter" | "saturn";

const TIERS: {
  key: TierKey;
  title: string;
  subtitle: string;
  buyInLabel: string;
}[] = [
  {
    key: "mars",
    title: "Tournament of Mars",
    subtitle: "Beginner • $20 entry",
    buyInLabel: "$20 Entry",
  },
  {
    key: "jupiter",
    title: "Tournament of Jupiter",
    subtitle: "Intermediate • $50 entry",
    buyInLabel: "$50 Entry",
  },
  {
    key: "saturn",
    title: "Tournament of Saturn",
    subtitle: "High Roller • $100 entry",
    buyInLabel: "$100 Entry",
  },
];

type DbTournament = {
  id: string;
  tier?: string | null;
  status?: string | null;
  start_date?: string | null; // date
  end_date?: string | null; // date
  join_open_at?: string | null; // timestamptz
  join_close_at?: string | null; // timestamptz
};

type TournamentCard = {
  id: string;
  tier: TierKey;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  joinOpensAt?: string | null;
  joinClosesAt?: string | null;
  isPlaceholder?: boolean;
  joined?: boolean;
};

const SDIO_KEY = (Constants?.expoConfig?.extra as any)
  ?.SPORTSDATAIO_KEY as string | undefined;

// helpers
const toDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const formatShort = (value?: string | null): string | null => {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export default function TournamentsScreen() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentCard[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [userId, setUserId] = useState<string | null>(null);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedTournament, setSelectedTournament] =
    useState<TournamentCard | null>(null);

  const [showSuccessAlert, setShowSuccessAlert] = useState(false);

  // grab user id once
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) {
          setUserId(data.user.id);
        }
      } catch (e) {
        console.log("getUser error", e);
      }
    })();
  }, []);

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select(
          "id,tier,status,start_date,end_date,join_open_at,join_close_at"
        )
        .order("start_date", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as DbTournament[];
      const now = new Date();

      // normalize & keep only tiers we care about
      const normalized: TournamentCard[] = rows
        .map((row) => {
          const rawTier = row.tier;
          const tierKey = (rawTier || "").toLowerCase() as TierKey;
          if (!["mars", "jupiter", "saturn"].includes(tierKey)) return null;

          return {
            id: row.id,
            tier: tierKey,
            status: row.status || "active",
            startDate: row.start_date ?? null,
            endDate: row.end_date ?? null,
            joinOpensAt: row.join_open_at ?? null,
            joinClosesAt: row.join_close_at ?? null,
            isPlaceholder: false,
          } as TournamentCard;
        })
        .filter(Boolean) as TournamentCard[];

      // pick 1 per tier
      const mergedBase: TournamentCard[] = TIERS.map((tierMeta) => {
        const tierRows = normalized.filter((t) => t.tier === tierMeta.key);

        if (tierRows.length === 0) {
          return {
            id: `placeholder-${tierMeta.key}`,
            tier: tierMeta.key,
            status: "locked",
            isPlaceholder: true,
          };
        }

        const withStart = tierRows.map((t) => ({
          ...t,
          _start: toDate(t.startDate),
        }));

        const upcoming = withStart
          .filter((t) => t._start && t._start >= now)
          .sort((a, b) => a._start!.getTime() - b._start!.getTime());

        if (upcoming.length > 0) {
          const chosen = upcoming[0];
          const { _start, ...rest } = chosen;
          return rest;
        }

        const past = withStart
          .filter((t) => t._start && t._start < now)
          .sort((a, b) => b._start!.getTime() - a._start!.getTime());

        if (past.length > 0) {
          const chosen = past[0];
          const { _start, ...rest } = chosen;
          return rest;
        }

        return tierRows[0];
      });

      // if no user, just show the base list
      if (!userId) {
        setTournaments(mergedBase);
        return;
      }

      // mark which tournaments the user has already joined
      const realTournamentIds = mergedBase
        .filter((t) => !t.isPlaceholder)
        .map((t) => t.id);

      if (realTournamentIds.length === 0) {
        setTournaments(mergedBase);
        return;
      }

      const { data: entryRows, error: entryErr } = await supabase
        .from("entries")
        .select("tournament_id")
        .eq("user_id", userId)
        .in("tournament_id", realTournamentIds);

      if (entryErr) throw entryErr;

      const joinedSet = new Set(
        (entryRows ?? []).map((row: any) => row.tournament_id)
      );

      const mergedWithJoined = mergedBase.map((t) =>
        joinedSet.has(t.id) ? { ...t, joined: true } : t
      );

      setTournaments(mergedWithJoined);
    } catch (err) {
      console.error("tournament fetch error", err);
      Alert.alert("Error", "Unable to load tournaments right now.");

      setTournaments((prev) => {
        if (prev.length > 0) return prev;
        return TIERS.map((tierMeta) => ({
          id: `placeholder-${tierMeta.key}`,
          tier: tierMeta.key,
          status: "locked" as const,
          isPlaceholder: true,
        }));
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTournaments();
  }, [loadTournaments]);

  // when user taps a tournament or button
  const handlePressTournament = (item: TournamentCard) => {
    if (item.isPlaceholder) return;

    // For now: every real tournament is open
    const isOpen = !item.isPlaceholder;

    if (item.joined) {
      router.push("/entries");
      return;
    }

    if (!isOpen) return;

    setSelectedTournament(item);
    setShowJoinModal(true);
  };

  const renderTournament = ({ item }: { item: TournamentCard }) => {
    const tierMeta = TIERS.find((t) => t.key === item.tier)!;
    const isOpen = !item.isPlaceholder;
    const isJoined = !!item.joined;

    // Week label logic
    const startStr = formatShort(item.startDate ?? item.joinOpensAt);
    const endStr = formatShort(item.endDate ?? item.joinClosesAt);
    let weekLabel: string | null = null;
    if (startStr && endStr && startStr !== endStr) {
      weekLabel = `Week: ${startStr} – ${endStr}`;
    } else if (startStr) {
      weekLabel = `Week of ${startStr}`;
    }

    const joinLabel = "Join anytime before it ends";

    const badgeText = isOpen ? (isJoined ? "Joined" : "Open") : "Locked";

    const buttonLabel = isJoined ? "Joined" : "Enter Now";
    const buttonDisabled = isJoined || !isOpen;

    return (
      <TouchableOpacity
        activeOpacity={buttonDisabled ? 1 : 0.85}
        onPress={() => handlePressTournament(item)}
        style={styles.cardWrapper}
      >
        <View style={styles.card}>
          <LinearGradient
            colors={["rgba(255,215,0,0.12)", "rgba(97,61,193,0.5)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardInner}
          >
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>{tierMeta.title}</Text>
                <Text style={styles.cardSubtitle}>{tierMeta.subtitle}</Text>
                {weekLabel && (
                  <Text style={styles.weekLabel}>{weekLabel}</Text>
                )}
                <Text style={styles.joinLabel}>{joinLabel}</Text>
              </View>
              <View style={styles.badge}>
                <Ionicons
                  name={isOpen ? "trophy" : "lock-closed"}
                  size={16}
                  color={GOLD}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.badgeTxt}>{badgeText}</Text>
              </View>
            </View>

            <View style={styles.cardFooterRow}>
              <View>
                <Text style={styles.metaLabel}>Target</Text>
                <Text style={styles.metaValue}>20 pts wins all</Text>
              </View>

              <TouchableOpacity
                disabled={buttonDisabled}
                activeOpacity={buttonDisabled ? 1 : 0.85}
                onPress={() => handlePressTournament(item)}
                style={[
                  styles.actionBtn,
                  buttonDisabled && styles.actionBtnDisabled,
                  isJoined && styles.actionBtnJoined,
                ]}
              >
                <Text
                  style={[
                    styles.actionBtnTxt,
                    (buttonDisabled || isJoined) && styles.actionBtnTxtDisabled,
                  ]}
                >
                  {buttonLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedTierMeta = selectedTournament
    ? TIERS.find((t) => t.key === selectedTournament.tier)
    : undefined;

  const selectedWeekLabel = selectedTournament
    ? (() => {
        const s = formatShort(selectedTournament.startDate);
        const e = formatShort(selectedTournament.endDate);
        if (s && e && s !== e) return `Week: ${s} – ${e}`;
        if (s) return `Week of ${s}`;
        return null;
      })()
    : null;

  return (
    <ImageBackground source={BG} style={styles.bgImage} resizeMode="cover">
      <View style={styles.overlay}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Available Tournaments</Text>
            <Text style={styles.headerSub}>
              Weekly tournaments · Join any time before they end
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (!SDIO_KEY) {
                Alert.alert(
                  "Sports Feed",
                  "SportsDataIO key is not set. Live games will be hidden."
                );
              } else {
                Alert.alert(
                  "Sports Feed",
                  "Live game data is powered by SportsDataIO."
                );
              }
            }}
            style={styles.infoBtn}
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={["rgba(0,0,0,0.45)", "rgba(97,61,193,0.45)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.timerBanner}
        >
          <View>
            <Text style={styles.bannerTitle}>
              Pick your tier and join whenever you’re ready
            </Text>
            <Text style={styles.bannerSub}>
              Entries stay open while the tournament is active.
            </Text>
          </View>
        </LinearGradient>

        {/* MENU: CURRENT ENTRIES + HISTORY */}
        <View style={styles.menuRow}>
          <TouchableOpacity
            style={styles.menuBtn}
            activeOpacity={0.9}
            onPress={() => router.push("/entries")}
          >
            <Ionicons
              name="receipt-outline"
              size={16}
              color={GOLD}
              style={styles.menuIcon}
            />
            <Text style={styles.menuTxt}>Current Entries</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuBtn}
            activeOpacity={0.9}
            onPress={() => router.push("/tournaments/TournamentHistory")}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={GOLD}
              style={styles.menuIcon}
            />
            <Text style={styles.menuTxt}>Tournament History</Text>
          </TouchableOpacity>
        </View>

        {loading && tournaments.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={GOLD} />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={tournaments}
            keyExtractor={(item) => item.id}
            renderItem={renderTournament}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                tintColor="#fff"
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            }
          />
        )}

        {/* JOIN MODAL */}
        <Modal
          visible={showJoinModal && !!selectedTournament}
          transparent
          animationType="slide"
          onRequestClose={() => setShowJoinModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              {selectedTournament && (
                <EntriesModal
                  tournamentId={selectedTournament.id}
                  userId={userId ?? ""}
                  tournamentTitle={
                    selectedTierMeta?.title ?? "Tournament entry"
                  }
                  tournamentSubtitle={selectedTierMeta?.subtitle ?? ""}
                  entryLabel={selectedTierMeta?.buyInLabel ?? undefined}
                  weekLabel={selectedWeekLabel}
                  joinLabel="Join anytime before it ends"
                  onClose={() => setShowJoinModal(false)}
                  onJoined={() => {
                    setShowJoinModal(false);
                    setSelectedTournament(null);
                    loadTournaments();
                    setShowSuccessAlert(true);
                  }}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* GALAXY SUCCESS ALERT */}
        <GalaxyAlert
          visible={showSuccessAlert}
          title="You're In! 🚀"
          message="You successfully joined the tournament. View it under Current Entries."
          buttonText="Awesome"
          onClose={() => {
            setShowSuccessAlert(false);
            router.push("/entries");
          }}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bgImage: { flex: 1 },
  overlay: {
    flex: 1,
    paddingTop: RFValue(60),
    paddingHorizontal: RFValue(18),
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: RFValue(14),
  },
  headerTitle: {
    color: "#fff",
    fontSize: RFValue(18),
    fontWeight: "800",
  },
  headerSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(11),
    marginTop: 2,
  },
  infoBtn: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(15),
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,20,0.8)",
  },
  timerBanner: {
    borderRadius: RFValue(16),
    paddingVertical: RFValue(8),
    paddingHorizontal: RFValue(12),
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: RFValue(10),
  },
  bannerTitle: {
    color: GOLD,
    fontSize: RFValue(11),
    fontWeight: "700",
  },
  bannerSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: RFValue(10),
    marginTop: 2,
  },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: RFValue(14),
  },
  menuBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: RFValue(4),
    paddingVertical: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(10,10,20,0.9)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  menuIcon: { marginRight: RFValue(6) },
  menuTxt: {
    color: "#fff",
    fontSize: RFValue(11),
    fontWeight: "700",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: RFValue(120),
  },
  cardWrapper: {
    marginBottom: RFValue(12),
  },
  card: {
    backgroundColor: CARD,
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardInner: {
    paddingVertical: RFValue(14),
    paddingHorizontal: RFValue(14),
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: RFValue(10),
  },
  cardTitle: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "800",
  },
  cardSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(11),
    marginTop: 2,
  },
  weekLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: RFValue(10),
    marginTop: 4,
  },
  joinLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: RFValue(9),
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
  },
  badgeTxt: {
    color: GOLD,
    fontSize: RFValue(10),
    fontWeight: "700",
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10),
  },
  metaValue: {
    color: "#fff",
    fontSize: RFValue(11),
    fontWeight: "700",
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: RFValue(16),
    paddingVertical: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: GOLD,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: BORDER,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnJoined: {
    backgroundColor: "rgba(255,215,0,0.15)",
  },
  actionBtnTxt: {
    color: "#000",
    fontSize: RFValue(11),
    fontWeight: "800",
  },
  actionBtnTxtDisabled: {
    color: "rgba(255,255,255,0.85)",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: RFValue(16),
  },
  modalCard: {
    width: "100%",
    borderRadius: RFValue(18),
    backgroundColor: "rgba(10,10,20,0.98)",
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(16),
  },
});
