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

/* ---- TSDB base ---- */
const TSD_KEY =
  process.env.EXPO_PUBLIC_TSPORTSDB_KEY ||
  (Constants?.expoConfig?.extra as any)?.THESPORTSDB_KEY ||
  "123";
const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(TSD_KEY)}`;

type LeagueKey = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";
type GameRow = { id: string; start: string; league: LeagueKey; home: string; away: string };

const SPORT_MAP: Record<Exclude<LeagueKey,"NFL">, { tsdbSport: string; leagues: string[] }> = {
  NBA:  { tsdbSport: "Basketball",        leagues: ["NBA"] },
  MLB:  { tsdbSport: "Baseball",          leagues: ["MLB","Major League Baseball"] },
  NHL:  { tsdbSport: "Ice_Hockey",        leagues: ["NHL","National Hockey League"] },
  WNBA: { tsdbSport: "Basketball",        leagues: ["WNBA","Women's National Basketball Association"] },
};
const NFL = { tsdbSport: "American_Football", leagues: ["NFL","National Football League"] };

const dayISO = (d: string | Date) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));
const pickShort = (full?: string) => {
  const name = (full || "").trim(); if (!name) return "TEAM";
  const parts = name.split(/\s+/); return parts.map(p => p[0]).join("").slice(0,3).toUpperCase() || name.slice(0,3).toUpperCase();
};

async function fetchTSDBEvents(tsdbSport: string, leagues: string[], dateISO: string) {
  const url = `${TSD_BASE}/eventsday.php?s=${encodeURIComponent(tsdbSport)}&d=${encodeURIComponent(dateISO)}`;
  const r = await fetch(url); if(!r.ok) return [];
  const j = await r.json();
  const evs = Array.isArray(j?.events) ? j.events : [];
  const allow = leagues.map(l => l.toLowerCase());
  return evs.filter((e:any)=> allow.some(a => String(e?.strLeague||"").toLowerCase().includes(a)));
}

async function fetchLeagueRows(league: LeagueKey, date: string): Promise<GameRow[]> {
  const spec = league === "NFL" ? NFL : SPORT_MAP[league as Exclude<LeagueKey,"NFL">];
  const rows = await fetchTSDBEvents(spec.tsdbSport, spec.leagues, date);
  return rows.map((e:any) => {
    const ts = e?.strTimestamp || (e?.dateEvent ? `${e.dateEvent}T${(e?.strTime || "00:00")}:00Z` : new Date().toISOString());
    const home = pickShort(e?.strHomeTeam);
    const away = pickShort(e?.strAwayTeam);
    return { id: String(e?.idEvent || `${home}-${away}-${ts}`), start: ts, league, home, away };
  }).sort((a,b)=> new Date(a.start).getTime() - new Date(b.start).getTime());
}

export default function ManagePick() {
  const router = useRouter();
  const { entryId, date } = useLocalSearchParams<{ entryId: string; date?: string }>();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<any>(null);
  const [dayISOState, setDayISOState] = useState<string>("");
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
          .from("entries") // or "entrants" if that's your table
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
          setDayISOState(iso);
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
    if (!dayISOState) return;
    try {
      setGamesBusy(true);
      setGames(await fetchLeagueRows(league, dayISO(dayISOState)));
    } catch (e: any) {
      setGames([]); Alert.alert("Games Error", e?.message || "Could not load games.");
    } finally {
      setGamesBusy(false);
    }
  };
  useEffect(() => { loadGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [league, dayISOState]);

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
        .eq("day_date", dayISOState)
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
          entry_id: entryId,                  // <-- IMPORTANT: link to entry (uuid)
          user_id: user.id,
          tournament_id: tournament.id,
          day_date: dayISOState,
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
    if (!dayISOState) return "";
    return new Date(dayISOState).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }, [dayISOState]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

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

  topBar: { paddingTop: RFValue(50), paddingHorizontal: RFValue(12), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: RFValue(32), height: RFValue(32), borderRadius: RFValue(8), alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: BORDER },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(18) },

  headerCard: { margin: RFValue(16), backgroundColor: CARD, borderRadius: RFValue(16), borderWidth: 1, borderColor: BORDER, padding: RFValue(14) },
  subTitle: { color: "rgba(255,255,255,0.9)", fontSize: RFValue(14), fontWeight: "800" },
  noteTxt: { color: "#ccc", marginTop: RFValue(6) },
  lockTxt: { color: "#ddd", marginTop: RFValue(6) },

  tabsRow: { flexDirection: "row", gap: RFValue(8), paddingHorizontal: RFValue(16), marginBottom: RFValue(6) },
  tab: { paddingHorizontal: RFValue(10), paddingVertical: RFValue(6), borderRadius: RFValue(999), backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  tabActive: { backgroundColor: "rgba(255,215,0,0.18)", borderColor: "rgba(255,215,0,0.38)" },
  tabTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  tabTxtActive: { color: "#fff" },

  listWrap: { flex: 1, marginHorizontal: RFValue(10), marginBottom: RFValue(16), backgroundColor: "rgba(0,0,0,0.5)", borderRadius: RFValue(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },

  gameCard: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: RFValue(12), padding: RFValue(12) },
  gameTime: { color: GOLD, fontWeight: "800", fontSize: RFValue(12), marginBottom: RFValue(4) },
  gameTeams: { color: "#fff", fontWeight: "900", fontSize: RFValue(14), marginBottom: RFValue(8) },

  btnRow: { flexDirection: "row", gap: RFValue(10) },
  pickBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderColor: BORDER, borderWidth: 1, borderRadius: RFValue(12), paddingVertical: RFValue(10), alignItems: "center" },
  selected: { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.12)" },
  disabled: { opacity: 0.55 },
  pickTxt: { color: "#fff", fontWeight: "800" },
});
