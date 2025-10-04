import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  ImageBackground, ActivityIndicator, Alert, TextInput, Platform,
  RefreshControl, FlatList
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

/* =========================================================
   FREE/PAID SCOREBOARD HELPERS
   - NFL via SportsDataIO (needs key)
   - NBA/MLB/NHL/WNBA via ESPN free scoreboard
   Only used for slate preview + deriving first kickoff time.
========================================================= */
const SDIO_KEY = (Constants?.expoConfig?.extra as any)?.SPORTSDATAIO_KEY as string | undefined;

type LeagueKey = "NFL" | "NBA" | "MLB" | "NHL" | "WNBA";
export type GameRow = {
  id: string;
  start: string;   // ISO
  league: LeagueKey;
  home: { short: string; name: string };
  away: { short: string; name: string };
};

// SDIO date format: 2025-SEP-10
const toSDioDate = (d: string | Date) => {
  const dt = new Date(d);
  const M = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const DD = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${M}-${DD}`;
};

async function fetchNFL_SDIO(dayISO: string): Promise<GameRow[]> {
  if (!SDIO_KEY) return [];
  const base = "https://api.sportsdata.io/v3/nfl/scores/json";
  const url = `${base}/ScoresByDate/${toSDioDate(dayISO)}?key=${encodeURIComponent(SDIO_KEY)}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const arr = await r.json();
  if (!Array.isArray(arr)) return [];
  const rows: GameRow[] = arr.map((g: any) => ({
    id: String(g?.GameID ?? g?.GameKey ?? `${g?.HomeTeam}-${g?.AwayTeam}-${g?.Date}`),
    start: g?.Date ?? g?.DateTime ?? new Date().toISOString(),
    league: "NFL",
    home: { short: g?.HomeTeam ?? "HOME", name: g?.HomeTeam ?? "Home" },
    away: { short: g?.AwayTeam ?? "AWAY", name: g?.AwayTeam ?? "Away" },
  }));
  rows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return rows;
}

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
      home: { short: home?.team?.abbreviation || home?.team?.shortDisplayName || "HOME", name: home?.team?.displayName || "Home" },
      away: { short: away?.team?.abbreviation || away?.team?.shortDisplayName || "AWAY", name: away?.team?.displayName || "Away" },
    });
  }
  rows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return rows;
}

async function fetchAllLeagues(dayISO: string): Promise<GameRow[]> {
  const [nfl, nba, mlb, nhl, wnba] = await Promise.all([
    fetchNFL_SDIO(dayISO),
    fetchESPN("NBA", dayISO),
    fetchESPN("MLB", dayISO),
    fetchESPN("NHL", dayISO),
    fetchESPN("WNBA", dayISO),
  ]);
  return [...nfl, ...nba, ...mlb, ...nhl, ...wnba];
}

async function earliestKickMillis(dayISO: string): Promise<number | null> {
  try {
    const rows = await fetchAllLeagues(dayISO);
    if (!rows.length) return null;
    const ms = rows
      .map(r => new Date(r.start).getTime())
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b)[0];
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/* =========================================================
   UI helpers
========================================================= */
const GOLD = "#FFD700";
const PURPLE = "#613DC1";
const DARK = "#1a1a1a";

const PLANET_BY_RANK = ["Tournament of Mars", "Tournament of Jupiter", "Tournament of Saturn"];
const FEE_TO_PLANET: Record<string, string> = {
  "20": PLANET_BY_RANK[0],
  "50": PLANET_BY_RANK[1],
  "100": PLANET_BY_RANK[2],
};
const PROMO_CODES: Record<string, number> = { LUXE10: 10, VIP20: 20, BETA30: 30 };

const fmtMoney = (n: any) => `$${Number(n || 0).toFixed(2)}`;
const timeUntil = (ms: number) => {
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60), mm = m % 60;
  if (h >= 24) return `${Math.floor(h/24)}d ${h%24}h`;
  if (h >= 1) return `${h}h ${mm}m`;
  return `${mm}m`;
};

function makePlanetNameMap(list: any[]): Map<number, string> {
  const group = new Map<string, any[]>();
  for (const t of list) {
    const key = String(t.day_date);
    const arr = group.get(key) || [];
    arr.push(t);
    group.set(key, arr);
  }
  const map = new Map<number, string>();
  group.forEach((arr) => {
    arr.sort((a, b) => Number(a.entry_fee) - Number(b.entry_fee));
    arr.forEach((t, idx) => {
      const fee = Number(t.entry_fee);
      const fallback = FEE_TO_PLANET[String(fee)] || `Tournament $${fee}`;
      map.set(t.id, PLANET_BY_RANK[idx] || fallback);
    });
  });
  return map;
}

/* =========================================================
   Screen
========================================================= */
export default function TournamentsTab() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [planetById, setPlanetById] = useState<Map<number, string>>(new Map());
  const [joinedIds, setJoinedIds] = useState<Set<number | string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  // Join modal
  const [joinOpen, setJoinOpen] = useState(false);
  const [busyJoin, setBusyJoin] = useState(false);
  const [selectedT, setSelectedT] = useState<any>(null);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  // Joined confirmation
  const [joinedConfirmOpen, setJoinedConfirmOpen] = useState(false);

  // Status modal
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);

  // SLATE PREVIEW modal (all leagues)
  const [slateOpen, setSlateOpen] = useState(false);
  const [slateBusy, setSlateBusy] = useState(false);
  const [slateRows, setSlateRows] = useState<GameRow[]>([]);
  const [slateMsg, setSlateMsg] = useState<string>("");

  const tickRef = useRef<any>(null);

  const loadTournaments = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      // Pull open/visible tournaments (add .eq('is_archived', false) if you use that flag)
      const { data: list, error: tErr } = await supabase
        .from("tournaments")
        .select("*")
        .order("join_open_at", { ascending: true });
      if (tErr) throw tErr;

      const ids = (list || []).map((t: any) => t.id);

      // Counts from entries (your actual join table)
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: entrantRows, error: eErr } = await supabase
          .from("entries")
          .select("tournament_id");
        if (eErr) throw eErr;
        (entrantRows || []).forEach((r: any) => {
          counts[r.tournament_id] = (counts[r.tournament_id] || 0) + 1;
        });
      }
      const merged = (list || []).map((t: any) => ({ ...t, entrants_total: counts[t.id] ?? 0 }));

      const pmap = makePlanetNameMap(merged);

      // Which tournaments have I joined?
      const { data: mine, error: mErr } = await supabase
        .from("entries")
        .select("tournament_id");
      if (mErr) throw mErr;

      setTournaments(merged);
      setPlanetById(pmap);
      setJoinedIds(new Set((mine || []).map((r: any) => r.tournament_id)));
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to load tournaments");
    } finally {
      setRefreshing(false);
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => { loadTournaments(true); }, []);
  useEffect(() => {
    tickRef.current && clearInterval(tickRef.current);
    // refresh countdowns every 30s
    tickRef.current = setInterval(() => setTournaments((t) => [...t]), 30000);
    return () => clearInterval(tickRef.current);
  }, []);

  const planetTitle = (t: any) =>
    t?.planet_name || planetById.get(t.id) ||
    (FEE_TO_PLANET[String(Number(t.entry_fee || 0))] || `Tournament $${Number(t.entry_fee || 0)}`);

  const openJoin = (t: any) => {
    const fee = Number(t.entry_fee || t.entry_amount || 0);
    setSelectedT({ ...t, fee, displayName: planetTitle(t) });
    setPromoInput(""); setAppliedPromo(null);
    setJoinOpen(true);
  };

  const entryFee = useMemo(() => selectedT?.fee || 0, [selectedT]);
  const discountPct = useMemo(() => (appliedPromo ? PROMO_CODES[appliedPromo] || 0 : 0), [appliedPromo]);
  const discounted = useMemo(() => Math.max(0, entryFee - entryFee * (discountPct / 100)), [entryFee, discountPct]);

  const confirmJoin = async () => {
    try {
      setBusyJoin(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return Alert.alert("Sign in required", "Please log in to join tournaments.");

      // Edge function (Option A) — no ON CONFLICT anywhere
      const invokeJoin = async (name: string) => {
        const r = await supabase.functions.invoke(name, {
          body: { tournament_id: selectedT.id, debug: true },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.error) throw r.error;
        return typeof r.data === "string" ? JSON.parse(r.data as any) : (r.data as any);
      };
      let resp: any = null;
      try { resp = await invokeJoin("join_tournament"); }
      catch { resp = await invokeJoin("join-tournament"); }

      if (!resp?.ok && !resp?.alreadyJoined) {
        throw new Error(resp?.message || resp?.code || "Join failed");
      }

      setJoinOpen(false);
      setJoinedConfirmOpen(true);
      setJoinedIds(prev => new Set([...Array.from(prev), selectedT.id]));
    } catch (e: any) {
      Alert.alert("Unable to join", e.message || String(e));
    } finally {
      setBusyJoin(false);
    }
  };

  const openStatus = async (t: any) => {
    try {
      setStatusOpen(true);
      setStatusBusy(true);
      const entrants = typeof t.entrants_total === "number" ? t.entrants_total : null;
      const fee = Number(t.entry_fee || t.entry_amount || 0);
      const prizePool = entrants != null ? entrants * fee : null;

      const dayISO =
        t?.day_date ||
        (t?.start_date ? new Date(t.start_date).toISOString().slice(0, 10) : null) ||
        (t?.join_open_at ? new Date(t.join_open_at).toISOString().slice(0, 10) : null) ||
        new Date().toISOString().slice(0, 10);

      const derivedFirstKick = await earliestKickMillis(dayISO);
      const derivedClose = derivedFirstKick ? derivedFirstKick - 30 * 60 * 1000 : null;

      const openMs  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : null;
      const closeMs = t.join_close_at ? new Date(t.join_close_at).getTime() : (derivedClose ?? null);
      const now = Date.now();

      // Ignore DB t.status for display to avoid stale values
      const isJoinOpen = (openMs == null || now >= openMs) && (closeMs == null || now < closeMs);
      const status = isJoinOpen ? "Open" : (openMs && now < openMs) ? "Opens Soon" : (derivedFirstKick ? "Locked" : "Off day");

      setStatusData({
        id: t.id,
        name: planetTitle(t),
        entryFee: fee,
        status,
        opensAt: t.join_open_at,
        opensIn: openMs ? timeUntil(openMs) : "—",
        closesAt: closeMs ? new Date(closeMs).toISOString() : null,
        closesIn: closeMs ? timeUntil(closeMs) : "—",
        entrants,
        prizePool,
        house: prizePool != null ? prizePool * 0.25 : null,
        winnerTake: prizePool != null ? prizePool * 0.75 : null,
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const previewGames = async (t: any) => {
    setSlateOpen(true);
    setSlateBusy(true);
    setSlateRows([]);
    setSlateMsg("");

    const dayISO =
      t?.day_date ||
      (t?.start_date ? new Date(t.start_date).toISOString().slice(0, 10) : null) ||
      (t?.join_open_at ? new Date(t.join_open_at).toISOString().slice(0, 10) : null) ||
      new Date().toISOString().slice(0, 10);

    try {
      const rows = await fetchAllLeagues(dayISO);
      if (rows.length === 0) setSlateMsg("No games found on this date.");
      else setSlateRows(rows);
    } catch (e: any) {
      setSlateMsg(e?.message || "Could not load games.");
    } finally {
      setSlateBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={PURPLE} /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={styles.background} resizeMode="cover">
      <ScrollView
        contentContainerStyle={{ marginTop: RFValue(65), paddingBottom: RFValue(200), paddingHorizontal: RFValue(16) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTournaments(false)} tintColor="#fff" colors={["#613DC1"]} />}
      >
        {/* Top */}
        <View style={styles.topRow}>
          <Text style={styles.title}>Available Tournaments</Text>
          <View style={{ position: "relative" }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setMenuOpen((v) => !v)}>
              <Ionicons name="ellipsis-vertical" size={RFValue(20)} color="#fff" />
            </TouchableOpacity>
            {menuOpen && (
              <View style={styles.dropdownMenu}>
                <TouchableOpacity onPress={() => { setMenuOpen(false); router.push("/tournaments/TournamentHistory"); }}>
                  <Text style={styles.dropdownItem}>View History</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMenuOpen(false); router.push("/tournaments/TournamentStatus"); }}>
                  <Text style={styles.dropdownItem}>Tournament Status</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Opens every <Text style={{ color: GOLD }}>Tuesday</Text> · join within <Text style={{ color: GOLD }}>3 days</Text>.{"\n"}
            <Text style={{ color: GOLD }}>Closes 30m</Text> before first game.
          </Text>
        </View>

        {/* Centered badges */}
        <View style={styles.badgesRow}>
          <TouchableOpacity onPress={() => router.push("/entries")} activeOpacity={0.9}>
            <LinearGradient colors={["#FFE98B", "#FFD700"]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.badge, styles.badgeGold]}>
              <Ionicons name="trophy-outline" size={RFValue(16)} color="#111" />
              <Text style={styles.badgeGoldText}>Current Entries</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => loadTournaments(false)} activeOpacity={0.9} disabled={refreshing} style={{ opacity: refreshing ? 0.65 : 1 }}>
            <LinearGradient colors={["#7A68E9", "#613DC1"]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.badge, styles.badgePurple]}>
              {refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh" size={RFValue(16)} color="#fff" />}
              <Text style={styles.badgePurpleText}>{refreshing ? "Refreshing…" : "Refresh"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Cards */}
        {tournaments?.length ? (
          <View>
            {tournaments.map((t) => (
              <TournamentCard
                key={t.id}
                t={t}
                planetTitle={planetTitle}
                joined={joinedIds.has(t.id)}
                onOpenJoin={() => openJoin(t)}
                onOpenStatus={() => openStatus(t)}
                onPreview={() => previewGames(t)}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No open tournaments right now.</Text>
        )}
      </ScrollView>

      {/* JOIN MODAL */}
      <Modal visible={joinOpen} animationType="slide" transparent onRequestClose={() => setJoinOpen(false)}>
        <ScrollView contentContainerStyle={styles.overlay} keyboardShouldPersistTaps="handled">
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Join {selectedT?.displayName || ""}</Text>

            <Row label="Entry Fee" value={fmtMoney(entryFee)} />
            <Row
              label="Promo Code"
              valueNode={
                appliedPromo ? (
                  <View style={styles.promoPill}>
                    <Text style={styles.promoText}>{appliedPromo} • {PROMO_CODES[appliedPromo]}% off</Text>
                    <TouchableOpacity onPress={() => { setAppliedPromo(null); setPromoInput(""); }}>
                      <Text style={styles.promoRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.promoRow}>
                    <TextInput
                      value={promoInput}
                      onChangeText={setPromoInput}
                      placeholder="Enter code"
                      placeholderTextColor="#888"
                      style={styles.input}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity style={styles.applyBtn} onPress={() => {
                      const code = (promoInput || "").trim().toUpperCase();
                      if (!code) return;
                      if (!PROMO_CODES[code]) return Alert.alert("Invalid Code", "That promo code isn’t recognized.");
                      setAppliedPromo(code);
                    }}>
                      <Text style={styles.applyTxt}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                )
              }
            />

            <Row label="Amount to Withdraw" valueElStyle={{ color: GOLD }} value={fmtMoney(discounted)} />
            <Text style={styles.disclaimer}>This will be withdrawn from your funds (payments wiring later).</Text>

            <TouchableOpacity disabled={busyJoin} onPress={confirmJoin} style={[styles.confirmBtn, busyJoin && { opacity: 0.7 }]}>
              {busyJoin ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmTxt}>Confirm & Join</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={busyJoin} onPress={() => setJoinOpen(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.lockNote}>Closes 30m before first game (weekly picks).</Text>
          </View>
        </ScrollView>
      </Modal>

      {/* JOINED CONFIRM */}
      <Modal visible={joinedConfirmOpen} animationType="fade" transparent onRequestClose={() => setJoinedConfirmOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>You’re in! 🎉</Text>
            <Text style={styles.confirmBody}>
              Find it under <Text style={{ color: GOLD, fontWeight: "800" }}>Current Entries</Text> to make picks.
            </Text>
            <TouchableOpacity onPress={() => { setJoinedConfirmOpen(false); }} style={styles.gotoBtn}>
              <Text style={styles.gotoTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* STATUS MODAL */}
      <Modal visible={statusOpen} animationType="slide" transparent onRequestClose={() => setStatusOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.statusCard}>
            {statusBusy || !statusData ? (
              <ActivityIndicator color={GOLD} />
            ) : (
              <>
                <Text style={styles.statusTitle}>{statusData.name}</Text>
                <Row label="Status" value={statusData.status} />
                <Row label="Entry Fee" value={fmtMoney(statusData.entryFee)} />
                <Row label="Join Opens" value={`${statusData.opensAt ? new Date(statusData.opensAt).toLocaleString() : "—"} (${statusData.opensIn})`} />
                <Row label="Join Closes" value={`${statusData.closesAt ? new Date(statusData.closesAt).toLocaleString() : "—"} (${statusData.closesIn})`} />
                <View style={styles.hr} />
                <Row label="Entrants" value={statusData.entrants ?? "—"} />
                <Row label="Prize Pool" value={statusData.prizePool != null ? fmtMoney(statusData.prizePool) : "—"} />
                <Row label="House (25%)" value={statusData.house != null ? fmtMoney(statusData.house) : "—"} />
                <Row label="Winner Split" value={statusData.winnerTake != null ? fmtMoney(statusData.winnerTake) : "—"} />
                <TouchableOpacity onPress={() => setStatusOpen(false)} style={styles.closeBig}>
                  <Text style={styles.closeBigTxt}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* SLATE PREVIEW MODAL — ALL LEAGUES */}
      <Modal visible={slateOpen} animationType="slide" transparent onRequestClose={() => setSlateOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.slateCard}>
            <Text style={styles.slateTitle}>Preview Games (All Leagues)</Text>
            {slateBusy ? (
              <ActivityIndicator color={GOLD} />
            ) : slateRows.length ? (
              <FlatList
                data={slateRows}
                keyExtractor={(g) => `${g.league}-${g.id}`}
                style={{ maxHeight: RFValue(360) }}
                ItemSeparatorComponent={() => <View style={{ height: RFValue(8) }} />}
                renderItem={({ item }) => (
                  <View style={styles.slateRow}>
                    <Text style={styles.slateTime} numberOfLines={1}>
                      {item.league} • {new Date(item.start).toLocaleString()}
                    </Text>
                    <Text style={styles.slateTeams} numberOfLines={1} ellipsizeMode="tail">
                      {item.away.short} {item.away.name} @ {item.home.short} {item.home.name}
                    </Text>
                  </View>
                )}
                ListFooterComponent={<View style={{ height: RFValue(6) }} />}
              />
            ) : (
              <Text style={styles.slateEmpty}>{slateMsg || "No games found."}</Text>
            )}

            <TouchableOpacity onPress={() => setSlateOpen(false)} style={styles.closeBig}>
              <Text style={styles.closeBigTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

/* ------------ Child components ------------ */

type CardProps = {
  t: any;
  planetTitle: (t: any) => string;
  joined: boolean;
  onOpenJoin: () => void;
  onOpenStatus: () => void;
  onPreview: () => void;
};

const TournamentCard = memo(function TournamentCard({
  t, planetTitle, joined, onOpenJoin, onOpenStatus, onPreview,
}: CardProps) {
  const [statusLine, setStatusLine] = useState<string>("—");
  const [joinDisabled, setJoinDisabled] = useState<boolean>(true);

  const fee = Number(t?.entry_fee || t?.entry_amount || 0);
  const title = planetTitle(t);

  const dayISO =
    t?.day_date ||
    (t?.start_date ? new Date(t.start_date).toISOString().slice(0, 10) : null) ||
    (t?.join_open_at ? new Date(t.join_open_at).toISOString().slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let on = true;
    (async () => {
      const openMs  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : null;
      let closeMs = t.join_close_at ? new Date(t.join_close_at).getTime() : null;

      if (!closeMs) {
        const firstKick = await earliestKickMillis(dayISO);
        if (firstKick) closeMs = firstKick - 30 * 60 * 1000;
      }
      const now = Date.now();

      // Ignore DB t.status here to avoid random "Finished"
      const isOpen = (openMs == null || now >= openMs) && (closeMs == null || now < closeMs);

      let line = "Locked";
      if (isOpen && closeMs) line = `Closes in ${timeUntil(closeMs)}`;
      else if (!isOpen && openMs && now < openMs) line = `Opens in ${timeUntil(openMs)}`;
      else if (!closeMs) line = "Off day";

      if (on) {
        setStatusLine(line);
        setJoinDisabled(!isOpen || joined);
      }
    })();
    return () => { on = false; };
  }, [t.id, t.join_open_at, t.join_close_at, joined, dayISO]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={onPreview} style={styles.iconBtnSmall}>
            <Ionicons name="eye-outline" size={RFValue(18)} color={GOLD} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenStatus} style={styles.iconBtnSmall}>
            <Ionicons name="stats-chart" size={RFValue(18)} color={GOLD} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sub} numberOfLines={2}>
        Entry: <Text style={{ color: GOLD }}>{fmtMoney(fee)}</Text>{" "}
        · Join Window: {t.join_open_at ? new Date(t.join_open_at).toLocaleString() : "—"} → {t.join_close_at ? new Date(t.join_close_at).toLocaleString() : "—"}
      </Text>
      <Text style={styles.sub} numberOfLines={1}>
        Day: <Text style={{ color: "#fff" }}>{dayISO}</Text>
      </Text>
      <Text style={styles.countdown} numberOfLines={1}>{statusLine}</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity disabled={joinDisabled} onPress={onOpenJoin} style={[styles.joinBtn, (joinDisabled || joined) && { backgroundColor: "#555" }]}>
          <Text style={styles.joinTxt}>{joined ? "Joined ✓" : !joinDisabled ? "Join" : "Join Closed"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.houseNote} numberOfLines={2}>* 25% to house · last person standing splits the pot.</Text>
    </View>
  );
});

function Row({ label, value, valueNode, valueElStyle }: any) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.lab}>{label}</Text>
      {valueNode ? valueNode : <Text style={[rowStyles.val, valueElStyle]} numberOfLines={1} ellipsizeMode="tail">{value}</Text>}
    </View>
  );
}

/* ---------- Styles (kept your style) ---------- */
const styles = StyleSheet.create({
  background: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: RFValue(16) },
  title: { fontSize: RFValue(22), fontWeight: "700", color: "#fff" },
  iconBtn: { height: RFValue(36), width: RFValue(36), alignItems: "center", justifyContent: "center" },
  dropdownMenu: { position: "absolute", top: RFValue(32), right: 0, backgroundColor: "#222", borderRadius: RFValue(12), padding: RFValue(8), zIndex: 10 },
  dropdownItem: { color: "#fff", paddingVertical: RFValue(6), fontSize: RFValue(14), width: RFValue(190) },

  infoBanner: { backgroundColor: "rgba(0,0,0,0.55)", padding: RFValue(12), borderRadius: RFValue(12), marginTop: RFValue(12), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  infoText: { color: "#fff", fontSize: RFValue(12), lineHeight: RFValue(16) },

  badgesRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: RFValue(10), marginTop: RFValue(10), marginBottom: RFValue(4) },
  badge: { flexDirection: "row", alignItems: "center", gap: RFValue(6), paddingHorizontal: RFValue(12), paddingVertical: RFValue(6), borderRadius: RFValue(999), borderWidth: 1, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  badgeGold: { borderColor: "rgba(0,0,0,0.08)" },
  badgePurple: { borderColor: "rgba(255,255,255,0.18)" },
  badgeGoldText: { color: "#111", fontWeight: "900", fontSize: RFValue(12) },
  badgePurpleText: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },

  card: { backgroundColor: "rgba(0,0,0,0.6)", padding: RFValue(16), marginVertical: RFValue(10), borderRadius: RFValue(16), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, fontSize: RFValue(18), fontWeight: "800", color: "#fff" },
  iconBtnSmall: { height: RFValue(28), width: RFValue(28), alignItems: "center", justifyContent: "center" },
  sub: { color: "#ddd", marginTop: RFValue(4), fontSize: RFValue(12) },
  countdown: { color: GOLD, fontWeight: "700", marginTop: RFValue(6) },
  actionsRow: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(10) },
  joinBtn: { flex: 1, backgroundColor: PURPLE, padding: RFValue(10), borderRadius: RFValue(12), alignItems: "center" },
  joinTxt: { color: "#fff", fontWeight: "800" },
  houseNote: { marginTop: RFValue(6), color: "#bbb", fontSize: RFValue(11), fontStyle: "italic" },
  empty: { color: "#fff", textAlign: "center", marginTop: RFValue(24), opacity: 0.8 },

  overlay: { flexGrow: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingVertical: RFValue(50) },
  modal: { width: "92%", backgroundColor: DARK, borderRadius: RFValue(16), padding: RFValue(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalTitle: { fontSize: RFValue(18), fontWeight: "800", color: "#fff", marginBottom: RFValue(12), textAlign: "center" },

  promoRow: { flexDirection: "row", alignItems: "center", gap: RFValue(8) },
  input: { flex: 1, backgroundColor: "#2a2a2a", borderRadius: RFValue(10), paddingHorizontal: RFValue(10), paddingVertical: Platform.OS === "ios" ? RFValue(8) : RFValue(6), color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  applyBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(8), paddingHorizontal: RFValue(12), borderRadius: RFValue(10) },
  applyTxt: { color: "#fff", fontWeight: "800" },
  promoPill: { flexDirection: "row", alignItems: "center", gap: RFValue(8), backgroundColor: "rgba(97,61,193,0.25)", borderWidth: 1, borderColor: PURPLE, paddingHorizontal: RFValue(10), paddingVertical: RFValue(6), borderRadius: RFValue(999) },
  promoText: { color: "#fff", fontWeight: "700" },
  promoRemove: { color: GOLD, fontSize: RFValue(14) },

  disclaimer: { color: "#aaa", fontSize: RFValue(11), marginTop: RFValue(6) },
  confirmBtn: { backgroundColor: "#2c91a1", padding: RFValue(12), borderRadius: RFValue(12), marginTop: RFValue(12), alignItems: "center" },
  confirmTxt: { color: "#fff", fontWeight: "800" },
  cancelBtn: { padding: RFValue(10), marginTop: RFValue(6), alignItems: "center" },
  cancelTxt: { color: PURPLE, fontWeight: "800" },
  lockNote: { color: "#bbb", fontSize: RFValue(11), textAlign: "center", marginTop: RFValue(6) },

  confirmCard: { width: "86%", backgroundColor: DARK, borderRadius: RFValue(16), padding: RFValue(18), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  confirmTitle: { color: "#fff", fontSize: RFValue(18), fontWeight: "900", textAlign: "center", marginBottom: RFValue(8) },
  confirmBody: { color: "#ddd", fontSize: RFValue(13), textAlign: "center", lineHeight: RFValue(18) },
  gotoBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), marginTop: RFValue(10), alignItems: "center" },
  gotoTxt: { color: "#fff", fontWeight: "900" },

  statusCard: { width: "92%", backgroundColor: DARK, borderRadius: RFValue(16), padding: RFValue(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statusTitle: { color: "#fff", fontSize: RFValue(18), fontWeight: "900", textAlign: "center", marginBottom: RFValue(10) },
  hr: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: RFValue(8) },
  closeBig: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), marginTop: RFValue(12), alignItems: "center" },
  closeBigTxt: { color: "#fff", fontWeight: "800" },

  slateCard: { width: "92%", backgroundColor: DARK, borderRadius: RFValue(16), padding: RFValue(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  slateTitle: { color: "#fff", fontSize: RFValue(18), fontWeight: "900", textAlign: "center", marginBottom: RFValue(8) },
  slateRow: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: RFValue(10), padding: RFValue(10) },
  slateTime: { color: GOLD, fontWeight: "800", fontSize: RFValue(12), marginBottom: RFValue(4) },
  slateTeams: { color: "#fff", fontWeight: "700", fontSize: RFValue(13) },
  slateEmpty: { color: "#ddd", textAlign: "center", marginVertical: RFValue(10) },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: RFValue(6) },
  lab: { color: "#ccc", fontSize: RFValue(13) },
  val: { color: "#fff", fontSize: RFValue(14), fontWeight: "800", maxWidth: "70%" },
});
