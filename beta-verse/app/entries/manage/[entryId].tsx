// app/entries/manage/[entryId].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const BG = require("@/assets/images/bgDash.png");

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.18)";
const DIV = "rgba(255,255,255,0.10)";

type EntryStatus = "active" | "eliminated" | "winner" | "finished";

type EntryMeta = {
  id: string;
  tournamentId: string;
  fee: number;
  status: EntryStatus;
  planetName: string;
  startISO: string; // YYYY-MM-DD
  endISO: string; // YYYY-MM-DD
};

type Market = "ml" | "spread" | "total" | null;
type Side = "home" | "away" | "over" | "under" | null;

type PickRow = {
  id: string;
  day_date: string; // YYYY-MM-DD
  market: Market;
  side: Side;
  team: string | null;
  line: number | null;
  result: "WIN" | "LOSS" | "PUSH" | "PENDING" | null;
  points: number | null;
};

type DayInfo = {
  iso: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  pick: PickRow | null;
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

const POINT_GOAL = 20; // X = 20 points total goal

function payoutText(total: number) {
  if (total >= POINT_GOAL) return "You’re on track for 100% of the pool.";
  if (total >= POINT_GOAL / 2) return "You’re in the 50% payout range.";
  return "You’re currently in the 25% payout range.";
}

function statusPill(status: EntryStatus) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        bg: "rgba(34,229,139,0.18)",
        dot: "#22e58b",
      };
    case "eliminated":
      return {
        label: "Eliminated",
        bg: "rgba(255,94,94,0.18)",
        dot: "#ff5e5e",
      };
    case "winner":
      return {
        label: "Winner",
        bg: "rgba(255,215,0,0.22)",
        dot: GOLD,
      };
    default:
      return {
        label: "Finished",
        bg: "rgba(157,124,255,0.22)",
        dot: "#9d7cff",
      };
  }
}

function resultTag(pick: PickRow | null) {
  if (!pick) {
    return {
      text: "No pick yet",
      bg: "rgba(100,116,139,0.18)",
      color: "#e2e8f0",
    };
  }
  const res = (pick.result || "PENDING").toUpperCase();
  switch (res) {
    case "WIN":
      return {
        text: "WIN",
        bg: "rgba(40,227,164,0.12)",
        color: "#28e3a4",
      };
    case "LOSS":
      return {
        text: "LOSS",
        bg: "rgba(255,107,107,0.12)",
        color: "#ff6b6b",
      };
    case "PUSH":
      return {
        text: "PUSH",
        bg: "rgba(255,215,0,0.14)",
        color: GOLD,
      };
    case "PENDING":
    default:
      return {
        text: "Pending…",
        bg: "rgba(201,186,255,0.12)",
        color: "#c9baff",
      };
  }
}

// Pretty text for the pick
function formatPickSummary(pick: PickRow | null) {
  if (!pick) return "No pick yet";

  const team = pick.team || "";
  const line = pick.line;
  const lineStr =
    line == null ? "" : line > 0 ? `+${line}` : `${line}`;

  switch (pick.market) {
    case "ml":
      // ex: "COWBOYS ML"
      return `${team || (pick.side === "home" ? "Home" : "Away")} ML`.toUpperCase();
    case "spread":
      // ex: "COWBOYS +3.5"
      return `${(team ||
        (pick.side === "home" ? "Home" : "Away")
      ).toUpperCase()} ${lineStr}`.trim();
    case "total": {
      // ex: "OVER 46.5"
      const sideLabel =
        pick.side === "over" ? "Over" : pick.side === "under" ? "Under" : "";
      return `${sideLabel.toUpperCase()} ${line ?? ""}`.trim();
    }
    default:
      // fallback to just team / side
      if (team) return team.toUpperCase();
      if (pick.side === "home") return "HOME TEAM";
      if (pick.side === "away") return "AWAY TEAM";
      return "Pick";
  }
}

export default function ManageEntry() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<EntryMeta | null>(null);
  const [days, setDays] = useState<DayInfo[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);

  const todayISO = useMemo(() => toLocalISO(new Date()), []);

  const loadData = useCallback(async () => {
    try {
      if (!entryId) return;
      setLoading(true);

      // 1) get entry row
      const { data: eData, error: eErr } = await supabase
        .from("entries")
        .select("id, status, tournament_id")
        .eq("id", entryId)
        .maybeSingle();

      if (eErr) throw eErr;
      if (!eData) {
        Alert.alert("Not found", "Entry could not be found.");
        return;
      }

      // 2) get tournament row
      const { data: tData, error: tErr } = await supabase
        .from("tournaments")
        .select("id, start_date, end_date, entry_fee_cents, title")
        .eq("id", eData.tournament_id)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!tData) {
        Alert.alert("Error", "Tournament for this entry is missing.");
        return;
      }

      const d0 = parseLocalISO(String(tData.start_date));
      const d2 = addDays(d0, 2); // 3-day window

      const status: EntryStatus =
        eData.status === "eliminated"
          ? "eliminated"
          : eData.status === "winner"
          ? "winner"
          : new Date() > d2
          ? "finished"
          : "active";

      const meta: EntryMeta = {
        id: String(eData.id),
        tournamentId: String(eData.tournament_id),
        fee: Number(tData.entry_fee_cents ?? 0) / 100,
        status,
        planetName: planetNameFor(tData.title, tData.entry_fee_cents),
        startISO: toLocalISO(d0),
        endISO: toLocalISO(d2),
      };

      // 3) build day list
      const dayList: DayInfo[] = [0, 1, 2].map((offset) => {
        const d = addDays(d0, offset);
        const iso = toLocalISO(d);
        const label = d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        const isToday = iso === todayISO;
        const isPast = iso < todayISO;
        const isFuture = iso > todayISO;

        return {
          iso,
          label,
          isToday,
          isPast,
          isFuture,
          pick: null,
        };
      });

      const isoList = dayList.map((d) => d.iso);

      // 4) load picks
      const { data: picks, error: pErr } = await supabase
        .from("picks")
        .select("id, day_date, selection, result, points")
        .eq("entry_id", entryId)
        .in("day_date", isoList);

      if (pErr) throw pErr;

      const pMap = new Map<string, PickRow>();
      (picks || []).forEach((p: any) => {
        const sel = (p.selection || {}) as any;

        const market: Market =
          sel.market === "spread"
            ? "spread"
            : sel.market === "total"
            ? "total"
            : sel.market === "ml"
            ? "ml"
            : null;

        const sideRaw = sel.side;
        const side: Side =
          sideRaw === "home" ||
          sideRaw === "away" ||
          sideRaw === "over" ||
          sideRaw === "under"
            ? sideRaw
            : null;

        const team =
          typeof sel.team === "string" && sel.team.trim().length > 0
            ? sel.team.trim()
            : null;

        const line =
          typeof sel.line === "number"
            ? sel.line
            : sel.line == null
            ? null
            : Number(sel.line);

        pMap.set(String(p.day_date), {
          id: String(p.id),
          day_date: String(p.day_date),
          market,
          side,
          team,
          line,
          result: p.result ? String(p.result).toUpperCase() : "PENDING",
          points:
            typeof p.points === "number"
              ? p.points
              : p.points == null
              ? null
              : Number(p.points),
        });
      });

      const hydratedDays: DayInfo[] = dayList.map((d) => ({
        ...d,
        pick: pMap.get(d.iso) || null,
      }));

      setEntry(meta);
      setDays(hydratedDays);

      const todayInRange = hydratedDays.find((d) => d.isToday);
      setSelectedISO((todayInRange || hydratedDays[0])?.iso || null);
    } catch (err: any) {
      console.log("manage entry error", err);
      Alert.alert("Error", err.message || "Failed to load entry details.");
    } finally {
      setLoading(false);
    }
  }, [entryId, todayISO]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedDay = useMemo(
    () => days.find((d) => d.iso === selectedISO) || null,
    [days, selectedISO]
  );

  const totalPoints = useMemo(
    () => days.reduce((sum, d) => sum + (d.pick?.points || 0), 0),
    [days]
  );

  const selectedPoints = selectedDay?.pick?.points ?? 0;

  if (!entryId) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={{ color: "#fff" }}>Missing entry ID.</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
          <Text style={styles.backTxt}>Entries</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Picks</Text>
        <View style={{ width: RFValue(90) }} />
      </View>

      {loading || !entry ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: RFValue(14),
            paddingBottom: RFValue(32),
          }}
        >
          {/* Tournament summary card */}
          <LinearGradient
            colors={["rgba(31,18,61,0.96)", "rgba(8,4,26,0.96)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={styles.summaryLeft}>
              <View style={styles.badge}>
                <Ionicons name="planet" size={RFValue(16)} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>{entry.planetName}</Text>
                <Text style={styles.summarySub}>
                  Entry: ${entry.fee.toFixed(2)}
                </Text>
                <Text style={styles.summaryDates}>
                  {entry.startISO} → {entry.endISO}
                </Text>
              </View>
            </View>

            <View style={styles.summaryRight}>
              <View style={styles.statusPill}>
                {(() => {
                  const pill = statusPill(entry.status);
                  return (
                    <>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: pill.dot },
                        ]}
                      />
                      <Text style={styles.statusTxt}>{pill.label}</Text>
                    </>
                  );
                })()}
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsLabel}>Total Points</Text>
                <Text style={styles.pointsValue}>{totalPoints}</Text>
                <Text style={styles.pointsGoal}>Goal: {POINT_GOAL} pts</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Point system explanation */}
          <View style={styles.pointRuleCard}>
            <Text style={styles.pointRuleTitle}>Point System</Text>
            <Text style={styles.pointRuleText}>
              • Reach <Text style={styles.bold}>20 pts</Text> to win{" "}
              <Text style={styles.bold}>100%</Text> of the pool.{"\n"}
              • Reach <Text style={styles.bold}>10 pts</Text> to win{" "}
              <Text style={styles.bold}>50%</Text>.{"\n"}
              • Less than 10 pts wins <Text style={styles.bold}>25%</Text>.
            </Text>
            <Text style={styles.pointRuleHint}>{payoutText(totalPoints)}</Text>
          </View>

          {/* Day selector */}
          <View style={styles.daySelectorWrap}>
            <Text style={styles.sectionTitle}>Tournament Days</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: RFValue(4) }}
            >
              {days.map((d) => {
                const selected = d.iso === selectedISO;
                return (
                  <TouchableOpacity
                    key={d.iso}
                    onPress={() => setSelectedISO(d.iso)}
                    style={[styles.dayChip, selected && styles.dayChipActive]}
                  >
                    <Text
                      style={[
                        styles.dayChipLabel,
                        selected && styles.dayChipLabelActive,
                      ]}
                    >
                      {d.label}
                    </Text>
                    {d.isToday && <Text style={styles.dayToday}>Today</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Selected day detail */}
          {selectedDay && (
            <View style={styles.dayDetailCard}>
              <View style={styles.dayDetailHeader}>
                <View>
                  <Text style={styles.dayDetailTitle}>
                    {selectedDay.label}
                  </Text>
                  <Text style={styles.dayDetailSub}>
                    Daily points: {selectedPoints}
                  </Text>
                </View>
                {(() => {
                  const tag = resultTag(selectedDay.pick);
                  return (
                    <View
                      style={[styles.resultTag, { backgroundColor: tag.bg }]}
                    >
                      <Text
                        style={[
                          styles.resultTagText,
                          { color: tag.color },
                        ]}
                      >
                        {tag.text}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {selectedDay.pick ? (
                <View style={styles.pickBody}>
                  <Text style={styles.pickLabel}>Your pick</Text>
                  <Text style={styles.pickValue}>
                    {formatPickSummary(selectedDay.pick)}
                  </Text>

                  <View style={styles.pickPointsRow}>
                    <Text style={styles.pickPointsLabel}>Awarded points</Text>
                    <Text style={styles.pickPointsValue}>
                      {selectedDay.pick.points ?? 0}
                    </Text>
                  </View>

                  <Text style={styles.lockedText}>
                    This day is locked. Picks can’t be changed once submitted.
                  </Text>
                </View>
              ) : (
                <View style={styles.pickBody}>
                  <Text style={styles.noPickText}>
                    You haven&apos;t made a pick for this day yet.
                  </Text>
                  {selectedDay.isPast ? (
                    <Text style={styles.lockedText}>
                      This day is locked. You can&apos;t make a new pick.
                    </Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => {
                        router.push({
                          pathname: "/entries/[entryId]",
                          params: {
                            entryId: entry.id,
                            date: selectedDay.iso,
                          },
                        } as any);
                      }}
                    >
                      <Text style={styles.primaryBtnTxt}>Make Your Pick</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </ImageBackground>
  );
}

/* --- Styles --- */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#050012" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

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
    marginTop: RFValue(8),
    marginBottom: RFValue(10),
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    flexDirection: "row",
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  badge: {
    width: RFValue(28),
    height: RFValue(28),
    borderRadius: RFValue(10),
    backgroundColor: "rgba(255,215,0,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    marginRight: RFValue(8),
  },
  summaryTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(14),
  },
  summarySub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: RFValue(11),
  },
  summaryDates: {
    color: "rgba(255,255,255,0.65)",
    fontSize: RFValue(10),
  },
  summaryRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginBottom: RFValue(4),
  },
  statusDot: {
    width: RFValue(7),
    height: RFValue(7),
    borderRadius: RFValue(4),
    marginRight: RFValue(6),
  },
  statusTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: RFValue(10),
  },
  pointsBox: {
    alignItems: "flex-end",
  },
  pointsLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(9),
  },
  pointsValue: {
    color: GOLD,
    fontWeight: "900",
    fontSize: RFValue(18),
  },
  pointsGoal: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(9),
  },

  pointRuleCard: {
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(8,4,26,0.96)",
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
    marginBottom: RFValue(12),
  },
  pointRuleTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(13),
    marginBottom: RFValue(4),
  },
  pointRuleText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: RFValue(10),
    lineHeight: RFValue(14),
  },
  pointRuleHint: {
    marginTop: RFValue(6),
    color: "#c7b5ff",
    fontSize: RFValue(10),
  },
  bold: { fontWeight: "900", color: GOLD },

  daySelectorWrap: {
    marginBottom: RFValue(10),
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    fontSize: RFValue(12),
    marginBottom: RFValue(4),
  },
  dayChip: {
    marginRight: RFValue(8),
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.6)",
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  dayChipActive: {
    borderColor: GOLD,
    backgroundColor: "rgba(255,215,0,0.16)",
  },
  dayChipLabel: {
    color: "rgba(248,250,252,0.9)",
    fontSize: RFValue(11),
    fontWeight: "700",
  },
  dayChipLabelActive: {
    color: "#fff",
  },
  dayToday: {
    marginTop: RFValue(2),
    color: GOLD,
    fontSize: RFValue(9),
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  dayDetailCard: {
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(9,5,30,0.96)",
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(10),
  },
  dayDetailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: RFValue(6),
  },
  dayDetailTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(14),
  },
  dayDetailSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(11),
  },
  resultTag: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
  },
  resultTagText: {
    fontWeight: "900",
    fontSize: RFValue(10),
  },

  pickBody: {
    marginTop: RFValue(4),
  },
  pickLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10),
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: RFValue(2),
  },
  pickValue: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(13),
    marginBottom: RFValue(8),
  },
  pickPointsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: RFValue(6),
  },
  pickPointsLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: RFValue(10),
  },
  pickPointsValue: {
    color: GOLD,
    fontWeight: "900",
    fontSize: RFValue(13),
  },
  noPickText: {
    color: "rgba(248,250,252,0.9)",
    fontSize: RFValue(11),
    marginBottom: RFValue(6),
  },
  lockedText: {
    color: "rgba(248,250,252,0.7)",
    fontSize: RFValue(10),
    marginTop: RFValue(4),
  },

  primaryBtn: {
    marginTop: RFValue(4),
    backgroundColor: PURPLE,
    borderRadius: RFValue(999),
    paddingVertical: RFValue(10),
    alignItems: "center",
  },
  primaryBtnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(12),
  },
});
