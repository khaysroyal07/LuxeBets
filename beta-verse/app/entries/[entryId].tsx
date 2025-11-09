import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
  Alert,
  FlatList,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

import {
  getGamesByDate,
  getTeams,
  normalizeGame,
  getOddsByDate,
  isNotEnabledError,
  type SportKey,
} from "@/lib/sportsdataio";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.95)";

type LeagueKey = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";
const L2S: Record<LeagueKey, SportKey> = {
  NFL: "nfl",
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  WNBA: "wnba",
};

type GameRow = {
  id: string;
  start: number;
  league: LeagueKey;
  homeShort: string;
  awayShort: string;
  homeName: string;
  awayName: string;
  mlHome?: number | null;
  mlAway?: number | null;
  spread?: number | null;
  total?: number | null;
};

type BetTab = "ML" | "Spread" | "Total";

type ExistingPick = {
  side: "home" | "away";
  leagueGameId: string;
  team: string;
};

const pickShort = (full?: string) => {
  const name = (full || "").trim();
  if (!name) return "TEAM";
  const parts = name.split(/\s+/);
  return (
    parts
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || name.slice(0, 3).toUpperCase()
  );
};

const dayISO = (d: string | Date) =>
  typeof d === "string" ? d : d.toISOString().slice(0, 10);
const fmtOdds = (v?: number | null) =>
  v == null ? "" : v > 0 ? ` (+${v})` : ` (${v})`;
const mins = (ms: number) => Math.floor(ms / 60000);

export default function ManagePick() {
  const router = useRouter();
  const { entryId, date } =
    useLocalSearchParams<{ entryId: string; date?: string }>();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<{
    id: string;
    start_date: string;
    end_date?: string | null;
    entry_fee_cents: number;
  } | null>(null);
  const [dayISOState, setDayISOState] = useState<string>("");
  const [league, setLeague] = useState<LeagueKey>("NFL");

  const [betTab, setBetTab] = useState<BetTab>("ML");
  const [gamesBusy, setGamesBusy] = useState(false);
  const [games, setGames] = useState<GameRow[]>([]);
  const [existing, setExisting] = useState<ExistingPick | null>(null);
  const [locked, setLocked] = useState<boolean>(false);
  const [notEnabled, setNotEnabled] = useState<boolean>(false);

  const tick = useRef<any>(null);
  useEffect(() => {
    tick.current && clearInterval(tick.current);
    tick.current = setInterval(() => setGames((g) => [...g]), 30000);
    return () => clearInterval(tick.current);
  }, []);

  // load entry, tournament, and existing pick
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // 1) entry
        const { data: ent, error: entErr } = await supabase
          .from("entries")
          .select("id, tournament_id")
          .eq("id", entryId)
          .maybeSingle();
        if (entErr) throw entErr;
        if (!ent) throw new Error("Entry not found.");

        // 2) tournament_phase
        const { data: t, error: tErr } = await supabase
          .from("tournament_phase")
          .select("id, start_date, end_date, entry_fee_cents")
          .eq("id", ent.tournament_id)
          .maybeSingle();
        if (tErr) throw tErr;
        if (!t) throw new Error("Tournament not found.");

        const iso = typeof date === "string" ? date : (t.start_date as string);

        // 3) existing pick for this entry/day (via day_date)
        const { data: { user } } = await supabase.auth.getUser();
        let curr: ExistingPick | null = null;
        if (user) {
          const { data: pick } = await supabase
            .from("picks")
            .select("selection, league_game_id, day_date")
            .eq("entry_id", entryId)
            .eq("day_date", iso)
            .maybeSingle();

          if (pick && pick.selection) {
            const sel: any = pick.selection;
            const side: "home" | "away" =
              sel.side === "away" ? "away" : "home";
            const team: string = sel.team || "";
            if (team && pick.league_game_id) {
              curr = {
                side,
                leagueGameId: String(pick.league_game_id),
                team,
              };
            }
          }
        }

        if (on) {
          setTournament({
            id: String(t.id),
            start_date: String(t.start_date),
            end_date: t.end_date ? String(t.end_date) : null,
            entry_fee_cents: Number(t.entry_fee_cents ?? 0),
          });
          setDayISOState(iso);
          if (curr) {
            setExisting(curr);
            setLocked(true);
          } else {
            setExisting(null);
            setLocked(false);
          }
        }
      } catch (e: any) {
        console.warn(e);
        Alert.alert("Error", e?.message || "Failed to load entry.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [entryId, date]);

  // load games & odds
  const loadGames = async () => {
    if (!dayISOState) return;
    try {
      setGamesBusy(true);
      setNotEnabled(false);

      const sport = L2S[league];
      const teams = await getTeams(sport);

      const raw = await getGamesByDate(sport, new Date(dayISO(dayISOState)));
      const mapped = (raw || []).map((g: any) =>
        normalizeGame(sport, g, teams)
      );

      let oddsMap: Record<string, any> = {};
      try {
        oddsMap = await getOddsByDate(sport, new Date(dayISO(dayISOState)));
      } catch (err: any) {
        if (isNotEnabledError(err)) setNotEnabled(true);
      }

      const now = Date.now();
      const OPEN_FUDGE = 60 * 1000;

      const open = (mapped || [])
        .filter((g: any) => {
          const start = g.rawDate || 0;
          return start > now - OPEN_FUDGE;
        })
        .map((g: any) => {
          const o = oddsMap[String(g.id)] || {};
          return {
            id: String(g.id),
            start: g.rawDate || 0,
            league,
            homeShort: pickShort(g.homeName),
            awayShort: pickShort(g.awayName),
            homeName: g.homeName,
            awayName: g.awayName,
            mlHome: o.mlHome ?? null,
            mlAway: o.mlAway ?? null,
            spread: o.spread ?? null,
            total: o.total ?? null,
          } as GameRow;
        })
        .sort((a: any, b: any) => a.start - b.start);

      setGames(open);
    } catch (e: any) {
      if (!isNotEnabledError(e)) {
        Alert.alert("Games Error", e?.message || "Could not load games.");
      }
      setGames([]);
    } finally {
      setGamesBusy(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, [league, dayISOState]);

  // save pick – matches picks schema exactly
  const savePick = async (game: GameRow, side: "home" | "away") => {
    if (locked) {
      Alert.alert("Pick locked", "You already submitted a pick today.");
      return;
    }

    const now = Date.now();
    if (game.start <= now) {
      Alert.alert("Closed", "This game already started.");
      await loadGames();
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      if (!tournament) throw new Error("Tournament missing.");

      // check existing pick for this entry/day
      const { data: existingRow } = await supabase
        .from("picks")
        .select("id")
        .eq("entry_id", entryId)
        .eq("day_date", dayISOState)
        .maybeSingle();
      if (existingRow?.id) {
        setLocked(true);
        Alert.alert("Pick locked", "You already submitted a pick for this day.");
        return;
      }

      const team = side === "home" ? game.homeShort : game.awayShort;
      const sport = L2S[league];
      const market: "ml" | "spread" | "total" =
        betTab === "Spread" ? "spread" : betTab === "Total" ? "total" : "ml";

      const selectionPayload = {
        side,
        team,
        league_game_id: String(game.id),
        market,
      };

      const { error } = await supabase.from("picks").insert({
        entry_id: entryId,
        game_day: dayISOState,
        day_date: dayISOState,
        sport,
        market,
        league_game_id: String(game.id),
        selection: selectionPayload, // jsonb
        // result omitted – enum, nullable
      });

      if (error) throw error;

      setExisting({ side, leagueGameId: String(game.id), team });
      setLocked(true);
      Alert.alert("Saved", `Your pick is ${team.toUpperCase()}.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save pick.");
    }
  };

  const dayLabel = useMemo(() => {
    if (!dayISOState) return "";
    return new Date(dayISOState).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [dayISOState]);

  if (loading || !tournament) {
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

      {/* Day & lock info */}
      <View style={styles.headerCard}>
        <Text style={styles.subTitle}>{dayLabel}</Text>
        <Text style={styles.noteTxt}>
          One pick per day. You can pick from any game that{" "}
          <Text style={{ color: GOLD, fontWeight: "900" }}>hasn’t started</Text>{" "}
          yet.
        </Text>
        {!!existing && (
          <Text style={[styles.lockTxt, { marginTop: RFValue(6) }]}>
            Submitted:{" "}
            <Text style={{ color: GOLD, fontWeight: "900" }}>
              {existing.team.toUpperCase()}
            </Text>{" "}
            (locked)
          </Text>
        )}
      </View>

      {/* League tabs */}
      <View style={styles.tabsRow}>
        {(["NFL", "NBA", "MLB", "NHL", "WNBA"] as const).map((lg) => {
          const active = league === lg;
          return (
            <TouchableOpacity
              key={lg}
              onPress={() => setLeague(lg)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>
                {lg}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bet type tabs */}
      <View style={[styles.tabsRow, { marginTop: RFValue(6) }]}>
        {(["ML", "Spread", "Total"] as BetTab[]).map((b) => {
          const active = betTab === b;
          return (
            <TouchableOpacity
              key={b}
              onPress={() => setBetTab(b)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>
                {b}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: RFValue(16), marginTop: RFValue(6) }}>
        <Text style={{ color: "#ccc", fontSize: RFValue(11) }}>
          Viewing {betTab}. We always submit a simple team pick so your entry
          stays compatible.
        </Text>
      </View>

      {/* Games list */}
      <View style={styles.listWrap}>
        {gamesBusy ? (
          <ActivityIndicator color={GOLD} />
        ) : games.length === 0 ? (
          <Text
            style={{
              color: "#ddd",
              textAlign: "center",
              marginTop: RFValue(16),
              paddingHorizontal: RFValue(14),
            }}
          >
            No {league} games left to enter for this day.
          </Text>
        ) : (
          <FlatList
            data={games}
            keyExtractor={(g) => g.id}
            ItemSeparatorComponent={() => (
              <View style={{ height: RFValue(10) }} />
            )}
            renderItem={({ item }) => {
              const pickedThis =
                existing && existing.leagueGameId === item.id;
              const isStarted = item.start <= Date.now();
              const startTxt = new Date(item.start).toLocaleString();
              const timeLeftMin = Math.max(0, mins(item.start - Date.now()));
              const startsIn = isStarted
                ? "Started"
                : timeLeftMin >= 60
                ? `Starts in ${Math.floor(timeLeftMin / 60)}h ${
                    timeLeftMin % 60
                  }m`
                : `Starts in ${timeLeftMin}m`;

              const homeSpreadLabel =
                item.spread != null
                  ? item.spread > 0
                    ? `+${item.spread}`
                    : `${item.spread}`
                  : "";
              const awaySpreadLabel =
                item.spread != null
                  ? item.spread > 0
                    ? `${-item.spread}`
                    : `+${Math.abs(item.spread)}`
                  : "";
              const totalLabel =
                item.total != null ? `${item.total}` : "";

              return (
                <View style={styles.gameCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.gameTime}>{startTxt}</Text>
                    <Text
                      style={{
                        color: isStarted ? "#f88" : GOLD,
                        fontWeight: "800",
                        fontSize: RFValue(11),
                      }}
                    >
                      {startsIn}
                    </Text>
                  </View>

                  <Text
                    style={styles.gameTeams}
                    numberOfLines={1}
                  >{`${item.awayShort} @ ${item.homeShort}`}</Text>
                  <Text
                    style={{ color: "#bbb", marginBottom: RFValue(6) }}
                    numberOfLines={1}
                  >
                    {item.awayName} @ {item.homeName}
                  </Text>

                  {betTab === "ML" && (
                    <Text
                      style={{ color: "#bbb", marginBottom: RFValue(8) }}
                    >
                      Moneyline: {item.awayShort}
                      {fmtOdds(item.mlAway)} @ {item.homeShort}
                      {fmtOdds(item.mlHome)}{" "}
                      {notEnabled ? "(odds unavailable)" : ""}
                    </Text>
                  )}
                  {betTab === "Spread" && (
                    <Text
                      style={{ color: "#bbb", marginBottom: RFValue(8) }}
                    >
                      Spread: {item.awayShort} {awaySpreadLabel} •{" "}
                      {item.homeShort} {homeSpreadLabel}{" "}
                      {notEnabled ? "(odds unavailable)" : ""}
                    </Text>
                  )}
                  {betTab === "Total" && (
                    <Text
                      style={{ color: "#bbb", marginBottom: RFValue(8) }}
                    >
                      Total: {totalLabel || "—"}{" "}
                      {notEnabled ? "(odds unavailable)" : ""}
                    </Text>
                  )}

                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      disabled={locked || isStarted}
                      onPress={() => savePick(item, "away")}
                      style={[
                        styles.pickBtn,
                        pickedThis &&
                          existing?.team === item.awayShort &&
                          styles.selected,
                        (locked || isStarted) && styles.disabled,
                      ]}
                    >
                      <Text style={styles.pickTxt}>
                        Pick {item.awayShort}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={locked || isStarted}
                      onPress={() => savePick(item, "home")}
                      style={[
                        styles.pickBtn,
                        pickedThis &&
                          existing?.team === item.homeShort &&
                          styles.selected,
                        (locked || isStarted) && styles.disabled,
                      ]}
                    >
                      <Text style={styles.pickTxt}>
                        Pick {item.homeShort}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isStarted && (
                    <Text
                      style={{
                        color: "#f88",
                        marginTop: RFValue(6),
                        fontSize: RFValue(11),
                      }}
                    >
                      This game already started.
                    </Text>
                  )}
                  {locked && !pickedThis && (
                    <Text
                      style={{
                        color: "#ddd",
                        marginTop: RFValue(6),
                        fontSize: RFValue(11),
                      }}
                    >
                      You already made today’s pick.
                    </Text>
                  )}
                </View>
              );
            }}
            contentContainerStyle={{
              paddingVertical: RFValue(10),
              paddingHorizontal: RFValue(12),
            }}
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
  subTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: RFValue(14),
    fontWeight: "800",
  },
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
  tabActive: {
    backgroundColor: "rgba(255,215,0,0.18)",
    borderColor: "rgba(255,215,0,0.38)",
  },
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: RFValue(12),
    padding: RFValue(12),
  },
  gameTime: {
    color: GOLD,
    fontWeight: "800",
    fontSize: RFValue(12),
    marginBottom: RFValue(4),
  },
  gameTeams: {
    color: "#fff",
    fontWeight: "900",
    fontSize: RFValue(14),
    marginBottom: RFValue(2),
  },
  btnRow: { flexDirection: "row", gap: RFValue(10) },
  pickBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: RFValue(12),
    paddingVertical: RFValue(12),
    alignItems: "center",
  },
  selected: { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.12)" },
  disabled: { opacity: 0.45 },
  pickTxt: { color: "#fff", fontWeight: "800" },
});
