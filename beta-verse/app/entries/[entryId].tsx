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

type LeagueKey = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";
type GameRow = { id: string; start: string; league: LeagueKey; home: string; away: string };

// SDIO date 2025-SEP-10
const toSDioDate = (d: string | Date) => {
  const dt = new Date(d);
  const M = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const DD = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${M}-${DD}`;
};

// ESPN (free)
async function fetchESPN(league: Exclude<LeagueKey,"NFL">, dayISO: string): Promise<GameRow[]> {
  const map: Record<Exclude<LeagueKey,"NFL">, string> = { NBA: "nba", MLB: "mlb", NHL: "nhl", WNBA: "wnba" };
  const sport = map[league];
  const yyyymmdd = dayISO.replace(/-/g, "");
  const url = `https://site.api.espn.com/apis/v2/sports/${sport}/${sport}/scoreboard?dates=${yyyymmdd}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const json = await r.json();
  const events = Array.isArray(json?.events) ? json.events : [];
  const rows: GameRow[] = [];
  for (const ev of events) {
    const c = ev?.competitions?.[0]; if (!c) continue;
    const start = c?.date || ev?.date || new Date().toISOString();
    const home = c?.competitors?.find((t: any) => t?.homeAway === "home");
    const away = c?.competitors?.find((t: any) => t?.homeAway === "away");
    rows.push({
      id: String(ev?.id ?? c?.id ?? `${sport}-${start}`),
      start,
      league,
      home: home?.team?.abbreviation || home?.team?.shortDisplayName || "Home",
      away: away?.team?.abbreviation || away?.team?.shortDisplayName || "Away",
    });
  }
  return rows.sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime());
}

// NFL via SDIO
async function fetchNFL_SDIO(dayISO: string): Promise<GameRow[]> {
  if (!SDIO_KEY) return [];
  const base = "https://api.sportsdata.io/v3/nfl/scores/json";
  const url = `${base}/ScoresByDate/${toSDioDate(dayISO)}?key=${encodeURIComponent(SDIO_KEY)}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const arr = await r.json();
  if (!Array.isArray(arr)) return [];
  return arr.map((g: any) => ({
    id: String(g?.GameID ?? g?.GameKey ?? `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`),
    start: g?.Date ?? g?.DateTime ?? new Date().toISOString(),
    league: "NFL",
    home: g?.HomeTeam ?? "HOME",
    away: g?.AwayTeam ?? "AWAY",
  })).sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime());
}

export default function ManagePick() {
  const router = useRouter();
  const { entryId, date } = useLocalSearchParams<{ entryId: string; date?: string }>();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<any>(null);
  const [dayISO, setDayISO] = useState<string>("");
  const [league, setLeague] = useState<LeagueKey>("NFL");

  const [gamesBusy, setGamesBusy] = useState(false);
  const [games, setGames] = useState<GameRow[]>([]);
  const [existing, setExisting] = useState<{ selection: "home"|"away"; game_id: string; team_picked?: string } | null>(null);
  const [locked, setLocked] = useState<boolean>(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const { data: ent, error: entErr } = await supabase
          .from("entries") // your table name is 'entries'
          .select("id, tournament_id, tournaments(*)")
          .eq("id", entryId)
          .maybeSingle();
        if (entErr) throw entErr;
        const t = ent?.tournaments;
        if (!t) throw new Error("Missing tournament for entry.");

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
          if (curr) { setExisting({ selection: curr.selection, game_id: String(curr.game_id), team_picked: curr.team_picked ?? undefined }); setLocked(true); }
          else { setExisting(null); setLocked(false); }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [entryId, date]);

  const loadGames = async () => {
    if (!dayISO) return;
    try {
      setGamesBusy(true);
      if (league === "NFL") setGames(await fetchNFL_SDIO(dayISO));
      else setGames(await fetchESPN(league as Exclude<LeagueKey,"NFL">, dayISO));
    } catch (e: any) {
      setGames([]); Alert.alert("Games Error", e?.message || "Could not load games.");
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
          game_id: String(game.id),
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

  const leagueEnabled = league === "NFL" ? Boolean(SDIO_KEY) : true;

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

      {/* League filter tabs */}
      <View style={styles.tabsRow}>
        {(["NFL","NBA","MLB","NHL","WNBA"] as const).map((lg) => {
          const active = league === lg;
          return (
            <TouchableOpacity key={lg} onPress={() => setLeague(lg)} style={[styles.tab, active && styles.tabActive]}>
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
            Add SPORTSDATAIO_KEY in app.json → expo.extra to load NFL games.
          </Text>
        ) : games.length === 0 ? (
          <Text style={{ color: "#ddd", textAlign: "center", marginTop: RFValue(16), paddingHorizontal: RFValue(14) }}>
            No {league} games found for this day.
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

/* ---------- styles (kept your look) ---------- */
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
