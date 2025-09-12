// app/entries/[entryId].tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, ActivityIndicator, Alert, FlatList } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.95)";

const SDIO_KEY = (Constants?.expoConfig?.extra as any)?.SPORTSDATAIO_KEY as string | undefined;

// Toggle which leagues actually fetch live data.
// For UI testing: leave all here; only NFL returns data today.
const ENABLED_LEAGUES = ["NFL"]; // change to ["NFL","NBA","MLB","NHL","WNBA"] when you wire others

type GameRow = {
  id: string;
  start: string;   // ISO
  league: string;
  home: string;
  away: string;
};

// SportsDataIO expects YYYY-MMM-DD (e.g., 2025-SEP-10)
const toSDioDate = (d: string | Date) => {
  const dt = new Date(d);
  const M = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const DD = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${M}-${DD}`;
};

// ---- APIs by league ----
async function fetchGamesForLeague(league: string, dayISO: string): Promise<GameRow[]> {
  // If this league isn't enabled yet, return an empty list (UI will show a friendly note).
  if (!ENABLED_LEAGUES.includes(league)) return [];

  if (!SDIO_KEY) throw new Error("Missing SPORTSDATAIO_KEY. Add it in app.json under expo.extra.");

  const sdioFetch = async (base: string, path: string) => {
    const url = `${base}/${path}/${toSDioDate(dayISO)}?key=${encodeURIComponent(SDIO_KEY!)}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const arr = await r.json();
    return Array.isArray(arr) ? arr : [];
  };

  switch (league) {
    case "NFL": {
      // NFL daily listing: ScoresByDate
      const rows = await sdioFetch("https://api.sportsdata.io/v3/nfl/scores/json", "ScoresByDate");
      return rows.map((g: any) => ({
        id: String(g?.GameID ?? g?.GameKey ?? `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`),
        start: g?.Date ?? g?.DateTime ?? new Date().toISOString(),
        league,
        home: g?.HomeTeam ?? "Home",
        away: g?.AwayTeam ?? "Away",
      }));
    }
    // When you wire others, add cases here and switch to their proper endpoints.
    default:
      return [];
  }
}

export default function ManagePick() {
  const router = useRouter();
  const { entryId, date } = useLocalSearchParams<{ entryId: string; date?: string }>();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<any>(null);
  const [dayISO, setDayISO] = useState<string>("");
  const [league, setLeague] = useState<"NFL" | "NBA" | "MLB" | "NHL" | "WNBA">("NFL");

  const [gamesBusy, setGamesBusy] = useState(false);
  const [games, setGames] = useState<GameRow[]>([]);
  const [existing, setExisting] = useState<{ selection: "home"|"away"; game_id: string; team_picked?: string } | null>(null);
  const [locked, setLocked] = useState<boolean>(false);

  // Load entrant/tournament + existing pick for the day
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const { data: ent, error: entErr } = await supabase
          .from("entrants")
          .select("id, tournament_id, tournaments(*)")
          .eq("id", entryId)
          .maybeSingle();
        if (entErr) throw entErr;
        const t = ent?.tournaments;
        if (!t) throw new Error("Missing tournament for entrant.");

        const iso = typeof date === "string" ? date : (t.day_date as string);

        // check if user already picked this day
        const { data: { user } } = await supabase.auth.getUser();
        let curr: any = null;
        if (user) {
          const { data: pick } = await supabase
            .from("picks")
            .select("selection, game_id, team_picked")
            .eq("user_id", user.id)
            .eq("tournament_id", t.id)
            .eq("day_date", iso)
            .maybeSingle();
          if (pick?.selection) curr = pick;
        }

        if (on) {
          setTournament(t);
          setDayISO(iso);
          if (curr) {
            setExisting({ selection: curr.selection, game_id: String(curr.game_id), team_picked: curr.team_picked ?? undefined });
            setLocked(true); // already submitted → lock
          } else {
            setExisting(null);
            setLocked(false);
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [entryId, date]);

  // Load games when league or day changes
  const loadGames = async () => {
    if (!dayISO) return;
    try {
      setGamesBusy(true);
      const rows = await fetchGamesForLeague(league, dayISO);
      setGames(rows);
    } catch (e: any) {
      setGames([]);
      Alert.alert("Games Error", e?.message || "Could not load games.");
    } finally {
      setGamesBusy(false);
    }
  };
  useEffect(() => { loadGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [league, dayISO]);

  const savePick = async (game: GameRow, selection: "home" | "away") => {
    if (locked) {
      Alert.alert("Pick locked", "You cannot change a pick once it has been submitted.");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      // block if a pick exists
      const { data: existingRow } = await supabase
        .from("picks")
        .select("id")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .eq("day_date", dayISO)
        .maybeSingle();

      if (existingRow?.id) {
        setLocked(true);
        Alert.alert("Pick locked", "You already submitted a pick for this day.");
        return;
      }

      const team = selection === "home" ? game.home : game.away;
      const { error } = await supabase
        .from("picks")
        .insert({
          user_id: user.id,
          tournament_id: tournament.id,
          day_date: dayISO,
          game_id: String(game.id),  // schema uses text
          selection,
          result: "pending",
          team_picked: team,
        });
      if (error) throw error;

      setExisting({ selection, game_id: String(game.id), team_picked: team });
      setLocked(true);
      Alert.alert("Saved", `Your pick is ${team.toUpperCase()}.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save pick.");
    }
  };

  const dayLabel = useMemo(() => {
    if (!dayISO) return "";
    return new Date(dayISO).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }, [dayISO]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  const leagueEnabled = ENABLED_LEAGUES.includes(league);

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Make Pick</Text>
        <View style={{ width: RFValue(32) }} />
      </View>

      {/* Day & lock state */}
      <View style={styles.headerCard}>
        <Text style={styles.subTitle}>{dayLabel}</Text>
        {existing ? (
          <Text style={styles.lockTxt}>
            Submitted: <Text style={{ color: GOLD, fontWeight: "900" }}>{existing.team_picked || existing.selection.toUpperCase()}</Text> (locked)
          </Text>
        ) : (
          <Text style={styles.noteTxt}>Choose any game below for your pick.</Text>
        )}
      </View>

      {/* League filter tabs (all unlocked for UI testing) */}
      <View style={styles.tabsRow}>
        {(["NFL","NBA","MLB","NHL","WNBA"] as const).map((lg) => {
          const active = league === lg;
          return (
            <TouchableOpacity
              key={lg}
              onPress={() => setLeague(lg)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{lg}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Games list */}
      <View style={styles.listWrap}>
        {gamesBusy ? (
          <ActivityIndicator color={GOLD} />
        ) : !leagueEnabled ? (
          <Text style={{ color: "#ddd", textAlign: "center", marginTop: RFValue(16), paddingHorizontal: RFValue(14) }}>
            {league} is unlocked for UI testing. Live data isn’t wired yet for this category.
          </Text>
        ) : games.length === 0 ? (
          <Text style={{ color: "#ddd", textAlign: "center", marginTop: RFValue(16), paddingHorizontal: RFValue(14) }}>
            {SDIO_KEY ? `No ${league} games found for this day.` : "Add your SportsDataIO key in expo.extra to load games."}
          </Text>
        ) : (
          <FlatList
            data={games}
            keyExtractor={(g) => g.id}
            ItemSeparatorComponent={() => <View style={{ height: RFValue(10) }} />}
            renderItem={({ item }) => {
              const pickedThis = existing && existing.game_id === item.id;
              return (
                <View style={styles.gameCard}>
                  <Text style={styles.gameTime}>{new Date(item.start).toLocaleString()}</Text>
                  <Text style={styles.gameTeams} numberOfLines={1}>{item.away} @ {item.home}</Text>
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      disabled={locked}
                      onPress={() => savePick(item, "away")}
                      style={[styles.pickBtn, pickedThis && existing?.team_picked === item.away && styles.selected, locked && styles.disabled]}
                    >
                      <Text style={styles.pickTxt}>Pick {item.away}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={locked}
                      onPress={() => savePick(item, "home")}
                      style={[styles.pickBtn, pickedThis && existing?.team_picked === item.home && styles.selected, locked && styles.disabled]}
                    >
                      <Text style={styles.pickTxt}>Pick {item.home}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={{ paddingVertical: RFValue(10), paddingHorizontal: RFValue(12) }}
          />
        )}
      </View>
    </ImageBackground>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0d0013" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topBar: {
    paddingTop: RFValue(50),
    paddingHorizontal: RFValue(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: RFValue(32),
    height: RFValue(32),
    borderRadius: RFValue(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(18) },

  headerCard: {
    margin: RFValue(16),
    backgroundColor: CARD,
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(14),
  },
  subTitle: { color: "rgba(255,255,255,0.9)", fontSize: RFValue(14), fontWeight: "800" },
  noteTxt: { color: "#ccc", marginTop: RFValue(6) },
  lockTxt: { color: "#ddd", marginTop: RFValue(6) },

  tabsRow: {
    flexDirection: "row",
    gap: RFValue(8),
    paddingHorizontal: RFValue(16),
    marginBottom: RFValue(6),
  },
  tab: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tabActive: { backgroundColor: "rgba(255,215,0,0.18)", borderColor: "rgba(255,215,0,0.38)" },
  tabTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  tabTxtActive: { color: "#fff" },

  listWrap: {
    flex: 1,
    marginHorizontal: RFValue(10),
    marginBottom: RFValue(16),
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  gameCard: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    borderRadius: RFValue(12), padding: RFValue(12),
  },
  gameTime: { color: GOLD, fontWeight: "800", fontSize: RFValue(12), marginBottom: RFValue(4) },
  gameTeams: { color: "#fff", fontWeight: "900", fontSize: RFValue(14), marginBottom: RFValue(8) },

  btnRow: { flexDirection: "row", gap: RFValue(10) },
  pickBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: RFValue(12),
    paddingVertical: RFValue(10),
    alignItems: "center",
  },
  selected: { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.12)" },
  disabled: { opacity: 0.55 },
  pickTxt: { color: "#fff", fontWeight: "800" },
});
