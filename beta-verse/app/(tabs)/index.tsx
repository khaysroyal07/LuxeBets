// app/(tabs)/index.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
  ImageBackground,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  Modal,
  RefreshControl,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";

import {
  SportKey,
  getTeams,
  getGamesByDate,
  normalizeGame,
  isNotEnabledError,
} from "@/lib/sportsdataio";

const { width } = Dimensions.get("window");
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * ✅ FIX: WNBA + NHL icons
 * - Your old icon URLs were dead (404).
 * - Also: don't force tint on full-color icons (like JPG).
 */
const SPORT_TABS: Array<{
  key: SportKey;
  label: string;
  iconUrl: string;
  tint?: string; // if set, icon will be tinted (good for monochrome icons)
}> = [
  {
    key: "nfl",
    label: "NFL",
    iconUrl: "https://img.icons8.com/ios-filled/100/american-football.png",
    tint: "#fff",
  },
  {
    key: "nba",
    label: "NBA",
    iconUrl: "https://img.icons8.com/ios-filled/100/basketball.png",
    tint: "#fff",
  },
  {
    key: "wnba",
    label: "WNBA",
    // working icon; reuse the same basketball glyph, still reads fine
    iconUrl: "https://img.icons8.com/ios-filled/100/basketball.png",
    tint: "#fff",
  },
  {
    key: "mlb",
    label: "MLB",
    iconUrl: "https://img.icons8.com/ios-filled/100/baseball.png",
    tint: "#fff",
  },
  {
    key: "nhl",
    label: "NHL",
    // working hockey icon (full color) — do NOT tint
    iconUrl:
      "https://img.icons8.com/external-kmg-design-glyph-kmg-design/1200/external-ice-hockey-active-lifestyle-kmg-design-glyph-kmg-design.jpg",
  },
];

const SPORTS = SPORT_TABS.map((t) => t.key);
const YEAR_OPTIONS = ["Auto", 2025, 2024, 2023, 2022];
const DEFAULT_TIER = "20";
const defaultTeamLogo =
  "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg";
const PURPLE = "#613DC1";
const GOLD = "#FFD700";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function relativeWhen(ms?: number, b?: "FINAL" | "UPCOMING" | "LIVE") {
  if (!ms) return "";
  const now = Date.now();
  const diff = ms - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;

  if (b === "FINAL") {
    if (h >= 24) return `${Math.floor(h / 24)}d ago`;
    if (h >= 1) return `${h}h ago`;
    return `${m}m ago`;
  }
  if (diff <= 0) return "now";
  if (h >= 24) return `in ${Math.floor(h / 24)}d`;
  if (h >= 1) return `in ${h}h ${m ? m + "m" : ""}`.trim();
  return `in ${m}m`;
}

const makeEventKey = (sportKey: string, g: any) =>
  `${sportKey}:${String(g.id ?? `${g.homeName}-${g.awayName}`)}:${String(
    g.rawDate ?? 0
  )}`;
const uniqByKey = (sportKey: string, list: any[]) => {
  const seen = new Set<string>();
  return (list || []).filter((g) => {
    const k = makeEventKey(sportKey, g);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
function sanitizeUrl(u?: string | null) {
  if (!u) return null;
  try {
    const t = u.trim();
    return t.startsWith("http://") ? "https://" + t.slice(7) : t;
  } catch {
    return null;
  }
}

function TeamAvatar({ uri, name }: { uri?: string | null; name?: string }) {
  const [err, setErr] = useState(false);
  const good = !err && sanitizeUrl(uri || null);
  if (good)
    return (
      <Image
        source={{ uri: good }}
        onError={() => setErr(true)}
        style={styles.teamLogo}
      />
    );
  const initials =
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "??";
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress, style }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, selected && styles.chipSelected, style]}
    >
      <Text
        style={[styles.chipText, selected && styles.chipTextSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const MOCK_STREAKS = [
  {
    id: "1",
    name: "Ava King",
    streak: 8,
    avatarUrl: "https://i.pravatar.cc/100?img=5",
  },
  {
    id: "2",
    name: "Noah Lee",
    streak: 6,
    avatarUrl: "https://i.pravatar.cc/100?img=12",
  },
  {
    id: "3",
    name: "Maya Cruz",
    streak: 5,
    avatarUrl: "https://i.pravatar.cc/100?img=32",
  },
  {
    id: "4",
    name: "Owen Kim",
    streak: 4,
    avatarUrl: "https://i.pravatar.cc/100?img=44",
  },
  {
    id: "5",
    name: "Liam Fox",
    streak: 3,
    avatarUrl: "https://i.pravatar.cc/100?img=14",
  },
];
function trophyForRank(rank: number) {
  if (rank === 1)
    return { uri: "https://img.icons8.com/fluency/96/trophy.png" };
  if (rank === 2)
    return { uri: "https://img.icons8.com/color/96/silver-medal.png" };
  if (rank === 3)
    return { uri: "https://img.icons8.com/color/96/bronze-medal.png" };
  return null;
}

export default function Dash() {
  const [selectedSportIndex, setSelectedSportIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState<"Auto" | number>("Auto");

  const [teamsByKey, setTeamsByKey] = useState<Record<string, any>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [notEnabled, setNotEnabled] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const [quickFilter, setQuickFilter] =
    useState<"ALL" | "LIVE" | "UPCOMING" | "FINAL">("ALL");
  const [todayOnly, setTodayOnly] = useState(false);
  const [sortMode, setSortMode] =
    useState<"smart" | "timeAsc" | "timeDesc">("smart");

  const [profileOpen, setProfileOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [streaks, setStreaks] = useState<any[]>([]);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState("");

  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });
  const sportKey = SPORTS[selectedSportIndex] as SportKey;

  const go = useCallback(
    (path: string) => {
      setProfileOpen(false);
      requestAnimationFrame(() => router.push(path as any));
    },
    [router]
  );

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        setTeamsByKey({});
        const byKey = await getTeams(sportKey);
        if (!off) setTeamsByKey(byKey);
      } catch (e) {
        if (!off) setTeamsByKey({});
      }
    })();
    return () => {
      off = true;
    };
  }, [sportKey]);

  async function fetchWindowSerial(
    center: Date,
    aheadDays: number,
    backDays: number,
    stopAfter: number
  ) {
    const out: any[] = [];
    for (let i = 0; i <= aheadDays; i++) {
      const dt = new Date(center);
      dt.setDate(dt.getDate() + i);
      const arr = await getGamesByDate(sportKey, dt);
      out.push(...(arr || []));
      if (out.length >= stopAfter) break;
    }
    if (out.length < stopAfter) {
      for (let i = 1; i <= backDays; i++) {
        const dt = new Date(center);
        dt.setDate(dt.getDate() - i);
        const arr = await getGamesByDate(sportKey, dt);
        out.push(...(arr || []));
        if (out.length >= stopAfter) break;
      }
    }
    return out;
  }

  async function fetchYearSamples(year: number) {
    const sample = [
      new Date(`${year}-01-15`),
      new Date(`${year}-04-15`),
      new Date(`${year}-08-15`),
      new Date(`${year}-11-15`),
    ];
    let res: any[] = [];
    for (const d of sample) {
      const c = await getGamesByDate(sportKey, d);
      res = res.concat(c || []);
      if (res.length >= 40) break;
    }
    return res;
  }

  function enrichGames(list: any[]) {
    return (list || []).map((g: any) => normalizeGame(sportKey, g, teamsByKey));
  }
  function sortEnriched(arr: any[], mode: "smart" | "timeAsc" | "timeDesc") {
    if (!Array.isArray(arr)) return [];
    const A = [...arr];
    if (mode === "timeAsc")
      return A.sort((a, b) => (a.rawDate || 0) - (b.rawDate || 0));
    if (mode === "timeDesc")
      return A.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    const score: { [k: string]: number } = { LIVE: 0, UPCOMING: 1, FINAL: 2 };
    return A.sort((a, b) => {
      if (score[a.bucket] !== score[b.bucket])
        return score[a.bucket] - score[b.bucket];
      if (a.bucket === "FINAL" && b.bucket === "FINAL")
        return (b.rawDate || 0) - (a.rawDate || 0);
      return (a.rawDate || 0) - (b.rawDate || 0);
    });
  }

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      setEvents([]);
      setNote("");
      setNotEnabled(false);
      try {
        const now = new Date();
        let list: any[] = [];

        if (selectedYear === "Auto") {
          if (todayOnly) {
            const today = await getGamesByDate(sportKey, now);
            const e = enrichGames(today || []);
            const unique = uniqByKey(sportKey, e);
            if (!off) {
              setEvents(sortEnriched(unique, sortMode));
              setNote(unique.length ? "" : "No games today.");
            }
            setLoading(false);
            return;
          }

          list = await fetchWindowSerial(now, 5, 0, 60);
          let e = enrichGames(list);
          let up = e.filter((g) => g.bucket !== "FINAL");
          if (up.length === 0) {
            setNote("Looking ahead for upcoming games…");
            list = await fetchWindowSerial(now, 14, 0, 80);
            e = enrichGames(list);
            up = e.filter((g) => g.bucket !== "FINAL");
          }
          if (up.length === 0) {
            setNote("No upcoming found; showing recent finals…");
            list = await fetchWindowSerial(now, 0, 7, 80);
            e = enrichGames(list);
          }
          if (!e?.length) {
            const yr = now.getFullYear();
            setNote(`Sampling ${yr}…`);
            list = await fetchYearSamples(yr);
            e = enrichGames(list);
          }
          const unique = uniqByKey(sportKey, e);
          if (!off) setEvents(sortEnriched(unique, sortMode));
        } else {
          setNote(`Looking in ${selectedYear}…`);
          const yearList = await fetchYearSamples(Number(selectedYear));
          const e = enrichGames(yearList);
          const unique = uniqByKey(sportKey, e);
          if (!off) {
            setEvents(sortEnriched(unique, sortMode));
            setNote(unique.length ? "" : `No results in ${selectedYear}.`);
          }
        }
      } catch (e: any) {
        if (isNotEnabledError(e)) {
          setNotEnabled(true);
          setEvents([]);
          setNote("");
        } else {
          if (!off) {
            setEvents([]);
            setNote("No events to show.");
          }
        }
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportKey, selectedYear, todayOnly, sortMode, teamsByKey]);

  const shownEvents = useMemo(
    () =>
      quickFilter === "ALL"
        ? events
        : events.filter((e) => e.bucket === quickFilter),
    [events, quickFilter]
  );

  if (!fontsLoaded) return null;

  const TeamCol = ({ name, logo }: any) => (
    <View style={styles.teamCol}>
      <TeamAvatar uri={logo || defaultTeamLogo} name={name} />
      <View style={styles.teamNameBox}>
        <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
      </View>
    </View>
  );

  const EventCard = ({ item }: any) => {
    const tagStyle =
      item.bucket === "LIVE"
        ? { bg: "#22c55e", fg: "#0a2915" }
        : item.bucket === "UPCOMING"
        ? { bg: "#f59e0b", fg: "#2b1a00" }
        : { bg: "#6b7280", fg: "#0d1117" };

    return (
      <View style={styles.eventWrapper}>
        <View style={styles.eventCardVertical}>
          <BlurView intensity={60} tint="dark" style={styles.eventBgVertical}>
            <LinearGradient
              colors={[
                "rgba(63,0,94,0.95)",
                "rgba(61,34,139,0.9)",
                "rgba(9,9,22,0.95)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.statusWrap}>
              <View style={[styles.statusPill, { backgroundColor: tagStyle.bg }]}>
                <Text
                  style={[styles.statusPillText, { color: tagStyle.fg }]}
                  numberOfLines={1}
                >
                  {item.bucket}
                </Text>
              </View>
            </View>
            <View style={styles.mainRow}>
              <TeamCol name={item.homeName} logo={item.homeLogo} />
              <View style={styles.centerCol}>
                <Text style={styles.scoreText} numberOfLines={1}>
                  {item.homeScore ?? "-"} - {item.awayScore ?? "-"}
                </Text>
                <View style={styles.centerMetaBox}>
                  <Text style={styles.dateText} numberOfLines={1} ellipsizeMode="tail">
                    {item.when}
                  </Text>
                  <Text style={styles.relativeText} numberOfLines={1}>
                    {relativeWhen(item.rawDate, item.bucket)}
                  </Text>
                </View>
              </View>
              <TeamCol name={item.awayName} logo={item.awayLogo} />
            </View>
          </BlurView>
        </View>

        <View style={styles.standingsCardVertical}>
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>
              {item.homeName}
            </Text>
            <Text style={styles.standingText} numberOfLines={1}>
              W-L: — • —
            </Text>
          </View>
          <View style={styles.vDivider} />
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>
              {item.awayName}
            </Text>
            <Text style={styles.standingText} numberOfLines={1}>
              W-L: — • —
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSportTab = ({ item: k, index }: any) => {
    const cfg = SPORT_TABS.find((t) => t.key === k)!;
    const selected = selectedSportIndex === index;
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedSportIndex(index);
          setSelectedYear("Auto");
          setQuickFilter("ALL");
        }}
        style={[
          styles.sportIconHorizontal,
          selected && { borderColor: GOLD, borderWidth: 2 },
        ]}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: cfg.iconUrl }}
          style={[styles.sportIconSmall, cfg.tint ? { tintColor: cfg.tint } : null]}
        />
        <Text
          style={[styles.sportNameHorizontal, selected && { color: GOLD }]}
          numberOfLines={1}
        >
          {cfg.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const STREAKS_URL = "";
  const STREAKS_API_KEY = "";
  const loadStreaks = async () => {
    setStreakLoading(true);
    setStreakError("");
    try {
      let rows: any[] = [];
      if (STREAKS_URL) {
        const r = await fetch(STREAKS_URL, {
          headers: {
            "Content-Type": "application/json",
            ...(STREAKS_API_KEY
              ? {
                  apikey: STREAKS_API_KEY,
                  Authorization: `Bearer ${STREAKS_API_KEY}`,
                }
              : {}),
          },
        });
        if (r.ok) {
          const j = await r.json();
          rows = Array.isArray(j) ? j : j?.streaks || [];
        }
      }
      if (!rows.length) rows = MOCK_STREAKS;
      rows.sort((a, b) => (b.streak || 0) - (a.streak || 0));
      setStreaks(rows);
    } catch {
      setStreaks(MOCK_STREAKS);
      setStreakError("Using sample data.");
    } finally {
      setStreakLoading(false);
    }
  };

  /**
   * ✅ FIX: bottom tags on Premnix billboard card
   * - Your "pill row" could wrap weird + feel off-balance.
   * - Now: consistent alignment, spacing, and a small "tags row" that always sits cleanly.
   */
  const HeroTournamentCard = () => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() =>
        router.push({
          pathname: "/tournaments",
          params: { tier: DEFAULT_TIER },
        } as any)
      }
    >
      <BlurView intensity={45} tint="dark" style={styles.heroCardBlur}>
        <LinearGradient
          colors={[
            "rgba(15,23,42,0.85)",
            "rgba(76,29,149,0.8)",
            "rgba(15,23,42,0.9)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <View style={styles.heroBrandRow}>
              <Text style={styles.heroBrandDot}>●</Text>
              <Text style={styles.heroBrandText}>PREMNIX</Text>
              <Text style={styles.heroBrandTag}>GALAXY SPORTS</Text>
            </View>

            <Text style={styles.heroTitle}>Fear Nothing.</Text>
            <Text style={styles.heroSubtitle}>
              One weekly slate. One entry. Chase the top of the Premnix leaderboard.
            </Text>

            {/* ✅ tags row (fixed) */}
            <View style={styles.heroTagsRow}>
              <View style={styles.heroTagPillSolid}>
                <Text style={styles.heroTagPillSolidText}>
                  From ${DEFAULT_TIER} to play
                </Text>
              </View>

              <View style={styles.heroTagPillOutline}>
                <Text style={styles.heroTagPillOutlineText}>Sun–Tues • Weekly</Text>
              </View>

              <View style={styles.heroTagPillMuted}>
                <Text style={styles.heroTagPillMutedText}>Fast payouts</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroRight}>
            <View style={styles.heroRightBadge}>
              <Text style={styles.heroRightBadgeText}>FEATURED</Text>
            </View>

            <View style={styles.heroCtaWrapper}>
              <LinearGradient
                colors={["#fef9c3", "#fde68a", "#facc15"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCtaButton}
              >
                <Text style={styles.heroCtaTextMain}>Enter now</Text>
                <Text style={styles.heroCtaTextSub}>Spots open • Sun–Tues</Text>
              </LinearGradient>
            </View>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );

  return (
    <ImageBackground
      source={require("@/assets/images/bgDash.png")}
      style={styles.container}
    >
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.appTitle}>Premnix</Text>
        </View>

        <View style={{ flexDirection: "row", gap: RFValue(12) }}>
          <TouchableOpacity onPress={() => router.push("/leaderboard")} activeOpacity={0.85}>
            <Image
              source={{ uri: "https://img.icons8.com/ios-filled/50/leaderboard.png" }}
              style={[styles.iconSmall, { tintColor: GOLD }]}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setProfileOpen((v) => !v)} activeOpacity={0.85}>
            <Image
              source={{ uri: "https://img.icons8.com/ios-filled/50/user.png" }}
              style={[styles.iconSmall, { tintColor: "#fff" }]}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTER BUTTON ROW */}
      <View style={styles.filterRowTop}>
        <TouchableOpacity
          onPress={() => {
            LayoutAnimation.easeInEaseOut();
            setShowFilter((s) => !s);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.filterTopBtn}>
            <Image
              source={{ uri: "https://img.icons8.com/ios-filled/50/filter--v1.png" }}
              style={{
                width: RFValue(18),
                height: RFValue(18),
                tintColor: "#111",
              }}
            />
            <Text style={styles.filterTopBtnText} numberOfLines={1}>
              Filters
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.currentLeagueLabel}>
          {SPORT_TABS[selectedSportIndex].label} •{" "}
          {quickFilter === "ALL" ? "All games" : `${quickFilter} only`}
        </Text>
      </View>

      {/* FILTER PANEL */}
      {showFilter && (
        <BlurView intensity={80} tint="dark" style={styles.filterPanel}>
          <LinearGradient
            colors={[
              "rgba(25,0,40,0.95)",
              "rgba(71,21,117,0.95)",
              "rgba(6,8,34,0.98)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.filterTitle}>Quick filter</Text>
          <View style={styles.filterRowChips}>
            {["ALL", "LIVE", "UPCOMING", "FINAL"].map((q) => (
              <Chip
                key={q}
                label={q}
                selected={quickFilter === (q as any)}
                onPress={() => setQuickFilter(q as any)}
                style={{ marginBottom: RFValue(6) }}
              />
            ))}
          </View>

          <Text style={[styles.filterTitle, { marginTop: RFValue(8) }]}>Time</Text>
          <View style={styles.filterRowChips}>
            <Chip
              label={todayOnly ? "Today ✓" : "Today"}
              selected={todayOnly}
              onPress={() => setTodayOnly((v) => !v)}
            />
          </View>

          <Text style={[styles.filterTitle, { marginTop: RFValue(8) }]}>Year</Text>
          <View style={styles.filterRowChips}>
            {YEAR_OPTIONS.map((y: any) => (
              <Chip
                key={String(y)}
                label={String(y)}
                selected={selectedYear === y}
                onPress={() => setSelectedYear(y)}
                style={{ marginBottom: RFValue(6) }}
              />
            ))}
          </View>

          <Text style={[styles.filterTitle, { marginTop: RFValue(8) }]}>Sort</Text>
          <View style={styles.filterRowChips}>
            <Chip label="Smart" selected={sortMode === "smart"} onPress={() => setSortMode("smart")} />
            <Chip label="Time ↑" selected={sortMode === "timeAsc"} onPress={() => setSortMode("timeAsc")} />
            <Chip label="Time ↓" selected={sortMode === "timeDesc"} onPress={() => setSortMode("timeDesc")} />
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: RFValue(8),
            }}
          >
            <TouchableOpacity
              onPress={() => {
                setQuickFilter("ALL");
                setTodayOnly(false);
                setSortMode("smart");
                setSelectedYear("Auto");
                setNote("");
                LayoutAnimation.easeInEaseOut();
                setShowFilter(false);
              }}
              style={styles.resetBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      )}

      {/* PROFILE MENU */}
      {profileOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} pointerEvents="box-none">
          <Pressable style={styles.overlayTap} onPress={() => setProfileOpen(false)} />
          <BlurView intensity={70} tint="dark" style={styles.profileMenu}>
            <Pressable style={styles.menuItem} onPress={() => go("/user/profile")}>
              <Image
                source={{ uri: "https://img.icons8.com/ios-glyphs/30/user--v1.png" }}
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Profile</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => go("/user/settings")}>
              <Image
                source={{ uri: "https://img.icons8.com/ios-glyphs/30/settings.png" }}
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Settings</Text>
            </Pressable>
          </BlurView>
        </View>
      )}

      {/* STREAK MODAL */}
      <Modal
        transparent
        animationType="fade"
        visible={streakOpen}
        onRequestClose={() => setStreakOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <LinearGradient
              colors={["rgba(97,61,193,0.35)", "rgba(44,7,53,0.35)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Winning streaks</Text>
              <TouchableOpacity onPress={() => setStreakOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {!!streakError && <Text style={styles.modalNote}>{streakError}</Text>}
            <FlatList
              data={streaks}
              keyExtractor={(it, idx) => String(it?.id ?? idx)}
              refreshControl={
                <RefreshControl refreshing={streakLoading} onRefresh={loadStreaks} tintColor="#fff" />
              }
              renderItem={({ item, index }) => {
                const trophy = trophyForRank(index + 1);
                const max = Math.max(1, streaks[0]?.streak || 1);
                const barW = Math.max(10, (item.streak / max) * (width * 0.5));
                return (
                  <View style={styles.rankRow}>
                    <Text style={styles.rankNum}>{index + 1}</Text>
                    {trophy ? <Image source={trophy} style={styles.trophy} /> : <View style={{ width: RFValue(24) }} />}
                    <Image source={{ uri: item.avatarUrl || defaultTeamLogo }} style={styles.userAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: barW }]} />
                      </View>
                    </View>
                    <Text style={styles.rankStreak}>W{item.streak}</Text>
                  </View>
                );
              }}
              ListEmptyComponent={!streakLoading ? <Text style={styles.modalNote}>No players yet.</Text> : null}
              contentContainerStyle={{ paddingBottom: RFValue(8) }}
              showsVerticalScrollIndicator={false}
            />
          </BlurView>
        </View>
      </Modal>

      {/* MAIN LIST */}
      <FlatList
        data={shownEvents}
        keyExtractor={(item) => makeEventKey(sportKey, item)}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              router.push({
                pathname: "/tournaments",
                params: { tier: DEFAULT_TIER },
              } as any)
            }
          >
            <EventCard item={item} />
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <>
            <HeroTournamentCard />

            <FlatList
              data={SPORTS}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(k) => k}
              renderItem={renderSportTab}
              contentContainerStyle={{
                paddingHorizontal: RFValue(10),
                paddingVertical: RFValue(8),
              }}
            />

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                {SPORT_TABS[selectedSportIndex].label} games
              </Text>
              <Text style={styles.sectionSubtitle}>Scroll through today’s galaxy slate</Text>
            </View>

            {loading ? (
              <ActivityIndicator
                size="small"
                color={GOLD}
                style={{ marginVertical: RFValue(10) }}
              />
            ) : null}

            {!!notEnabled && (
              <Text style={styles.infoText}>
                This league isn’t enabled on your SportsDataIO key yet.
              </Text>
            )}

            {!!note && <Text style={styles.infoText}>{note}</Text>}
          </>
        }
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No events to show.</Text> : null}
        ListFooterComponent={<View style={{ height: RFValue(40) }} />}
        contentContainerStyle={{ paddingBottom: RFValue(96) }}
        showsVerticalScrollIndicator={false}
      />
    </ImageBackground>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c031e" },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: RFValue(16),
    paddingTop: RFValue(48),
    paddingBottom: RFValue(4),
  },
  iconSmall: { width: RFValue(26), height: RFValue(26) },
  appTitle: {
    fontFamily: "PoppinsBold",
    fontSize: RFValue(22),
    color: "white",
  },

  filterRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: RFValue(16),
    paddingBottom: RFValue(6),
  },
  currentLeagueLabel: {
    fontFamily: "Poppins",
    fontSize: RFValue(11),
    color: "rgba(255,255,255,0.8)",
  },

  filterTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GOLD,
    paddingVertical: RFValue(6),
    paddingHorizontal: RFValue(10),
    borderRadius: RFValue(999),
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  filterTopBtnText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(12),
    marginLeft: RFValue(6),
    color: "#111",
  },

  filterPanel: {
    marginHorizontal: RFValue(12),
    marginTop: RFValue(4),
    marginBottom: RFValue(8),
    borderRadius: RFValue(18),
    padding: RFValue(10),
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    overflow: "hidden",
  },
  filterTitle: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(12),
    marginBottom: RFValue(4),
  },
  filterRowChips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  chip: {
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(6),
    marginRight: RFValue(6),
    marginTop: RFValue(6),
    borderRadius: RFValue(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "#1b0630",
  },
  chipSelected: {
    backgroundColor: PURPLE,
    borderColor: GOLD,
  },
  chipText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(12),
    color: "#fff",
  },
  chipTextSelected: { color: GOLD, fontWeight: "700" },
  resetBtn: {
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    backgroundColor: GOLD,
  },
  resetBtnText: {
    fontFamily: "PoppinsSemiBold",
    color: "#111",
    fontSize: RFValue(12),
  },

  sportIconHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(6),
    paddingHorizontal: RFValue(14),
    borderRadius: RFValue(16),
    marginHorizontal: RFValue(6),
    backgroundColor: "rgba(12,3,30,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sportIconSmall: {
    width: RFValue(26),
    height: RFValue(26),
    marginRight: RFValue(8),
  },
  sportNameHorizontal: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(14),
    color: "#fff",
  },

  /** 🪧 HERO (DARK TRANSPARENT) */
  heroCardBlur: {
    width: width * 0.94,
    alignSelf: "center",
    borderRadius: RFValue(22),
    marginTop: RFValue(8),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(4,7,20,0.7)",
  },
  heroContent: {
    flexDirection: "row",
    paddingHorizontal: RFValue(16),
    paddingVertical: RFValue(14),
  },
  heroLeft: {
    flex: 1.35,
    paddingRight: RFValue(10),
  },
  heroRight: {
    flex: 0.95,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: RFValue(4),
  },
  heroBrandDot: {
    fontSize: RFValue(10),
    color: GOLD,
    marginRight: RFValue(4),
  },
  heroBrandText: {
    fontFamily: "PoppinsBold",
    fontSize: RFValue(11),
    color: "#e5e7eb",
    marginRight: RFValue(6),
  },
  heroBrandTag: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(9),
    color: "rgba(226,232,240,0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: "PoppinsBold",
    fontSize: RFValue(20),
    color: "#fff",
    marginBottom: RFValue(2),
  },
  heroSubtitle: {
    fontFamily: "Poppins",
    fontSize: RFValue(11),
    color: "rgba(241,245,249,0.92)",
  },

  // ✅ fixed tags row
  heroTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: RFValue(10),
    gap: RFValue(6),
  },
  heroTagPillSolid: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(5),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(15,23,42,0.85)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.9)",
  },
  heroTagPillSolidText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(10),
    color: GOLD,
  },
  heroTagPillOutline: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(5),
    borderRadius: RFValue(999),
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
  },
  heroTagPillOutlineText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(10),
    color: "rgba(248,250,252,0.96)",
  },
  heroTagPillMuted: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(5),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroTagPillMutedText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(10),
    color: "rgba(226,232,240,0.95)",
  },

  heroRightBadge: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(15,23,42,0.9)",
    borderWidth: 1,
    borderColor: "rgba(248,250,252,0.5)",
    marginBottom: RFValue(10),
  },
  heroRightBadgeText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(9),
    color: "#e5e7eb",
    letterSpacing: 1.1,
  },
  heroCtaWrapper: {
    marginTop: "auto",
    shadowColor: "#facc15",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  heroCtaButton: {
    borderRadius: RFValue(20),
    paddingHorizontal: RFValue(14),
    paddingVertical: RFValue(8),
    borderWidth: 1,
    borderColor: "rgba(234,179,8,0.9)",
    alignItems: "center",
  },
  heroCtaTextMain: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(12),
    color: "#111827",
    lineHeight: RFValue(14),
  },
  heroCtaTextSub: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(9),
    color: "rgba(15,23,42,0.85)",
    marginTop: RFValue(2),
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between", // ✅ FIX (was "space_between")
    paddingHorizontal: RFValue(16),
    marginTop: RFValue(4),
  },
  sectionTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(14),
    color: "#fff",
  },
  sectionSubtitle: {
    fontFamily: "Poppins",
    fontSize: RFValue(10),
    color: "rgba(255,255,255,0.7)",
  },

  infoText: {
    color: "#fff",
    fontFamily: "Poppins",
    paddingHorizontal: RFValue(16),
    marginBottom: RFValue(6),
    opacity: 0.8,
  },
  emptyText: {
    color: "#fff",
    fontFamily: "Poppins",
    textAlign: "center",
    marginTop: RFValue(24),
    opacity: 0.7,
  },

  eventWrapper: {
    marginTop: RFValue(20),
    marginBottom: RFValue(16),
    alignItems: "center",
    justifyContent: "center",
  },
  eventCardVertical: {
    width: width * 0.9,
    borderRadius: RFValue(20),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: RFValue(10),
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 0.5,
  },
  eventBgVertical: {
    borderRadius: 20,
    paddingHorizontal: RFValue(12),
    paddingBottom: RFValue(12),
    paddingTop: RFValue(32),
    minHeight: RFValue(138),
    position: "relative",
  },

  statusWrap: {
    position: "absolute",
    top: RFValue(8),
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2,
  },
  statusPill: {
    minWidth: RFValue(60),
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(2),
    borderRadius: RFValue(999),
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(10),
  },

  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },

  teamCol: { width: RFValue(56), alignItems: "center" },
  teamLogo: {
    width: RFValue(56),
    height: RFValue(56),
    borderRadius: 999,
    marginBottom: RFValue(6),
    borderWidth: 1,
    borderColor: "#fff",
  },
  teamNameBox: {
    height: RFValue(16),
    justifyContent: "center",
    alignItems: "center",
    maxWidth: RFValue(100),
  },
  teamName: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(11),
    lineHeight: RFValue(14),
    color: "white",
    textAlign: "center",
  },

  centerCol: {
    flex: 1,
    minWidth: RFValue(140),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: RFValue(6),
  },
  scoreText: {
    fontFamily: Platform.OS === "android" ? "monospace" : "PoppinsSemiBold",
    fontSize: RFValue(22),
    lineHeight: RFValue(26),
    color: "white",
    ...(Platform.OS === "ios" ? { fontVariant: ["tabular-nums"] } : { letterSpacing: 0.5 }),
    textAlign: "center",
  },
  centerMetaBox: {
    marginTop: RFValue(2),
    height: RFValue(26),
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontFamily: "Poppins",
    fontSize: RFValue(10),
    lineHeight: RFValue(12),
    color: "white",
  },
  relativeText: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(10),
    lineHeight: RFValue(12),
    color: GOLD,
  },

  standingsCardVertical: {
    width: width * 0.9,
    backgroundColor: "rgba(7,7,24,0.96)",
    borderRadius: RFValue(16),
    padding: RFValue(10),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  standingBox: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: RFValue(4),
  },
  standingTeamName: {
    fontFamily: "PoppinsSemiBold",
    color: "white",
    fontSize: RFValue(12),
    marginBottom: RFValue(2),
    textAlign: "center",
  },
  standingText: {
    fontFamily: "Poppins",
    color: "white",
    fontSize: RFValue(11),
    textAlign: "center",
    opacity: 0.9,
  },
  vDivider: {
    width: 1,
    height: RFValue(24),
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  avatarFallback: {
    width: RFValue(56),
    height: RFValue(56),
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(255,215,0,0.15)",
  },
  avatarInitials: {
    fontFamily: "PoppinsSemiBold",
    color: GOLD,
    fontSize: RFValue(15),
  },

  overlayTap: { ...StyleSheet.absoluteFillObject },
  profileMenu: {
    position: "absolute",
    top: RFValue(92),
    right: RFValue(14),
    width: RFValue(170),
    borderRadius: RFValue(14),
    overflow: "hidden",
    backgroundColor: "rgba(30,30,30,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 5,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(10),
    paddingHorizontal: RFValue(12),
  },
  menuIcon: {
    width: RFValue(18),
    height: RFValue(18),
    tintColor: "#fff",
    marginRight: RFValue(8),
  },
  menuText: {
    color: "#fff",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(14),
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: RFValue(16),
  },
  modalCard: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "80%",
    borderRadius: RFValue(18),
    overflow: "hidden",
    backgroundColor: "rgba(25,25,25,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: RFValue(12),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: RFValue(6),
  },
  modalTitle: {
    color: "#fff",
    fontFamily: "PoppinsBold",
    fontSize: RFValue(18),
  },
  modalClose: {
    width: RFValue(32),
    height: RFValue(32),
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modalCloseText: {
    color: "#fff",
    fontSize: RFValue(16),
    fontFamily: "PoppinsSemiBold",
  },
  modalNote: {
    color: "#fff",
    opacity: 0.75,
    fontFamily: "Poppins",
    marginBottom: RFValue(6),
  },

  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(8),
    gap: RFValue(8),
  },
  rankNum: {
    width: RFValue(22),
    textAlign: "center",
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
  },
  trophy: { width: RFValue(24), height: RFValue(24) },
  userAvatar: {
    width: RFValue(36),
    height: RFValue(36),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  rankName: {
    color: "#fff",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(13),
  },
  progressTrack: {
    height: RFValue(6),
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: RFValue(999),
    marginTop: RFValue(4),
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: GOLD },
  rankStreak: {
    color: GOLD,
    fontFamily: "PoppinsSemiBold",
    paddingHorizontal: RFValue(4),
  },
});
