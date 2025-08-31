// app/tournaments/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  ImageBackground, ActivityIndicator, Alert, TextInput, Platform,
  RefreshControl,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase, FUNCTIONS_BASE } from "@/lib/supabase";

/* ---------- Config / theme ---------- */
const GOLD = "#FFD700";
const PURPLE = "#613DC1";
const DARK = "#1a1a1a";
const JOIN_FN_PATHS = ["/join_tournament", "/join-tournament"];
const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const PROMO_CODES = { LUXE10: 10, VIP20: 20, BETA30: 30 };

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;
const timeUntil = (ms) => {
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60), mm = m % 60;
  if (h >= 24) return `${Math.floor(h/24)}d ${h%24}h`;
  if (h >= 1) return `${h}h ${mm}m`;
  return `${mm}m`;
};
const displayNameForTournament = (t) => {
  const fee = Number(t?.entry_fee || 0);
  return t?.week_label || TIER_TO_PLANET[String(fee)] || (fee ? `Tournament $${fee}` : "Tournament");
};

export default function TournamentsIndex() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [joinedIds, setJoinedIds] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  // Join modal
  const [joinOpen, setJoinOpen] = useState(false);
  const [busyJoin, setBusyJoin] = useState(false);
  const [selectedT, setSelectedT] = useState(null);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  // Joined confirmation
  const [joinedConfirmOpen, setJoinedConfirmOpen] = useState(false);

  // Status modal
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusData, setStatusData] = useState(null);

  // ticker to refresh countdown labels (no extra fetch)
  const tickRef = useRef(null);

  /* ---------- Load tournaments straight from Supabase ---------- */
  const loadTournaments = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      // tournaments list
      const { data: tourneys, error: tErr } = await supabase
        .from("tournaments")
        .select("*")
        .order("join_open_at", { ascending: true });
      if (tErr) throw tErr;

      // entrants totals (try view if exists, else count locally)
      const ids = (tourneys || []).map((t) => t.id);
      let countsMap = {};
      if (ids.length) {
        const { data: countRows, error: vErr } = await supabase
          .from("v_tournament_counts")
          .select("tournament_id,entrants_total")
          .in("tournament_id", ids);
        if (!vErr && Array.isArray(countRows)) {
          countRows.forEach((r) => { countsMap[r.tournament_id] = Number(r.entrants_total || 0); });
        } else {
          const { data: entrantRows } = await supabase
            .from("entrants")
            .select("tournament_id")
            .in("tournament_id", ids);
          (entrantRows || []).forEach((r) => {
            countsMap[r.tournament_id] = (countsMap[r.tournament_id] || 0) + 1;
          });
        }
      }
      const merged = (tourneys || []).map((t) => ({ ...t, entrants_total: countsMap[t.id] ?? 0 }));

      // which I joined (RLS keeps this to me)
      const { data: mine, error: mErr } = await supabase
        .from("entrants")
        .select("tournament_id");
      if (mErr) throw mErr;

      setTournaments(merged);
      setJoinedIds(new Set((mine || []).map((r) => r.tournament_id)));
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to load tournaments");
    } finally {
      setRefreshing(false);
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => { loadTournaments(true); }, []);
  useEffect(() => {
    tickRef.current && clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTournaments((t) => [...t]), 30000);
    return () => clearInterval(tickRef.current);
  }, []);

  /* ---------- Join flow ---------- */
  const openJoin = (t) => {
    const fee = Number(t.entry_fee || 0);
    setSelectedT({ ...t, fee, displayName: displayNameForTournament(t) });
    setPromoInput(""); setAppliedPromo(null);
    setJoinOpen(true);
  };

  const entryFee = useMemo(() => selectedT?.fee || 0, [selectedT]);
  const discountPct = useMemo(() => (appliedPromo ? PROMO_CODES[appliedPromo] || 0 : 0), [appliedPromo]);
  const discounted = useMemo(() => Math.max(0, entryFee - entryFee * (discountPct / 100)), [entryFee, discountPct]);
  const applyPromo = () => {
    const code = (promoInput || "").trim().toUpperCase();
    if (!code) return;
    if (!PROMO_CODES[code]) return Alert.alert("Invalid Code", "That promo code isn’t recognized.");
    setAppliedPromo(code);
  };
  const removePromo = () => { setAppliedPromo(null); setPromoInput(""); };
// REPLACE your current confirmJoin with this version
const confirmJoin = async () => {
  try {
    setBusyJoin(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setBusyJoin(false);
      return Alert.alert("Sign in required", "Please log in to join tournaments.");
    }

    // helper to try one function name
    const invokeJoin = async (name) => {
      const { data, error } = await supabase.functions.invoke(name, {
        body: { tournament_id: selectedT.id },
        headers: { Authorization: `Bearer ${session.access_token}` }, // safe for verify_jwt = true
      });
      if (error) throw error;
      return data;
    };

    // try both names: join_tournament (underscore) then join-tournament (hyphen)
    let resp = null;
    try { resp = await invokeJoin("join_tournament"); }
    catch (e1) {
      try { resp = await invokeJoin("join-tournament"); }
      catch (e2) { throw e2; }
    }

    if (!resp?.ok && !resp?.alreadyJoined) {
      throw new Error(resp?.error || resp?.message || "Join failed");
    }

    setJoinOpen(false);
    setJoinedConfirmOpen(true);
    setJoinedIds((prev) => new Set([...Array.from(prev), selectedT.id]));
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("Network request failed") || msg.includes("TypeError")) {
      Alert.alert(
        "Network error",
        "Couldn’t reach the join function. Using the SDK avoids base URL/CORS issues — if this persists, confirm the Edge function is deployed and named `join_tournament` or `join-tournament`."
      );
    } else {
      Alert.alert("Unable to join", msg);
    }
  } finally {
    setBusyJoin(false);
  }
};


  /* ---------- Status modal ---------- */
  const openStatus = async (t) => {
    try {
      setStatusOpen(true);
      setStatusBusy(true);

      const entrants = typeof t.entrants_total === "number" ? t.entrants_total : null;
      const fee = Number(t.entry_fee || 0);
      const prizePool = entrants != null ? entrants * fee : null;

      const openMs  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : null;
      const closeMs = t.join_close_at ? new Date(t.join_close_at).getTime() : null;
      const now = Date.now();
      const isOpen = t.status === "open" && (openMs == null || now >= openMs) && (closeMs == null || now < closeMs);
      const status = isOpen ? "Open" : (openMs && now < openMs) ? "Opens Soon" : "Locked";

      setStatusData({
        id: t.id,
        name: displayNameForTournament(t),
        sport: "ANY",
        entryFee: fee,
        status,
        opensAt: t.join_open_at,
        opensIn: openMs ? timeUntil(openMs) : "—",
        closesAt: t.join_close_at,
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
        {tournaments?.length ? tournaments.map((t) => {
          const fee = Number(t.entry_fee || 0);
          const title = displayNameForTournament(t);
          const openMs  = t.join_open_at  ? new Date(t.join_open_at).getTime()  : null;
          const closeMs = t.join_close_at ? new Date(t.join_close_at).getTime() : null;
          const now = Date.now();
          const isOpen =
            t.status === "open" &&
            (openMs == null || now >= openMs) &&
            (closeMs == null || now < closeMs);
          const alreadyIn = joinedIds.has(t.id);
          const joinDisabled = !isOpen || alreadyIn;

          let statusLine = "—";
          if (isOpen && closeMs) statusLine = `Closes in ${timeUntil(closeMs)}`;
          else if (!isOpen && openMs && now < openMs) statusLine = `Opens in ${timeUntil(openMs)}`;
          else statusLine = "Locked";

          return (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{title} • ANY</Text>
                <TouchableOpacity onPress={() => openStatus(t)} style={styles.iconBtnSmall}>
                  <Ionicons name="stats-chart" size={RFValue(18)} color={GOLD} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sub}>
                Entry: <Text style={{ color: GOLD }}>{fmtMoney(fee)}</Text>{" "}
                · Join Window: {t.join_open_at ? new Date(t.join_open_at).toLocaleString() : "—"} → {t.join_close_at ? new Date(t.join_close_at).toLocaleString() : "—"}
              </Text>
              <Text style={styles.countdown}>{statusLine}</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity disabled={joinDisabled} onPress={() => openJoin(t)} style={[styles.joinBtn, joinDisabled && { backgroundColor: "#555" }]}>
                  <Text style={styles.joinTxt}>{alreadyIn ? "Joined ✓" : isOpen ? "Join" : "Join Closed"}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.houseNote}>* 25% to house · last person standing splits the pot.</Text>
            </View>
          );
        }) : (
          <Text style={styles.empty}>No open tournaments right now.</Text>
        )}
      </ScrollView>

      {/* JOIN MODAL */}
      <Modal visible={joinOpen} animationType="slide" transparent onRequestClose={() => setJoinOpen(false)}>
        <ScrollView contentContainerStyle={styles.overlay} keyboardShouldPersistTaps="handled">
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              Join {displayNameForTournament(selectedT)} (ANY)
            </Text>

            <Row label="Entry Fee" value={fmtMoney(entryFee)} />
            <Row
              label="Promo Code"
              valueNode={
                appliedPromo ? (
                  <View style={styles.promoPill}>
                    <Text style={styles.promoText}>
                      {appliedPromo} • {PROMO_CODES[appliedPromo]}% off
                    </Text>
                    <TouchableOpacity onPress={removePromo}><Text style={styles.promoRemove}>✕</Text></TouchableOpacity>
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
                    <TouchableOpacity style={styles.applyBtn} onPress={applyPromo}>
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

            <Text style={styles.lockNote}>Closes 30m before first game (daily picks).</Text>
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
            <TouchableOpacity onPress={() => { setJoinedConfirmOpen(false); router.push("/entries"); }} style={styles.gotoBtn}>
              <Text style={styles.gotoTxt}>Go to Current Entries</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinedConfirmOpen(false)} style={styles.closeSmall}>
              <Text style={styles.closeSmallTxt}>Close</Text>
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
                <Text style={styles.statusTitle}>
                  {statusData.name} • ANY
                </Text>
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
    </ImageBackground>
  );
}

function Row({ label, value, valueNode, valueElStyle }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.lab}>{label}</Text>
      {valueNode ? valueNode : <Text style={[rowStyles.val, valueElStyle]}>{value}</Text>}
    </View>
  );
}

/* ---------- Styles ---------- */
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
  cardTitle: { fontSize: RFValue(18), fontWeight: "800", color: "#fff" },
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
  closeSmall: { padding: RFValue(10), alignItems: "center", marginTop: RFValue(6) },
  closeSmallTxt: { color: GOLD, fontWeight: "800" },

  statusCard: { width: "92%", backgroundColor: DARK, borderRadius: RFValue(16), padding: RFValue(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statusTitle: { color: "#fff", fontSize: RFValue(18), fontWeight: "900", textAlign: "center", marginBottom: RFValue(10) },
  hr: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: RFValue(8) },
  closeBig: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), marginTop: RFValue(12), alignItems: "center" },
  closeBigTxt: { color: "#fff", fontWeight: "900" },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: RFValue(6) },
  lab: { color: "#ccc", fontSize: RFValue(13) },
  val: { color: "#fff", fontSize: RFValue(14), fontWeight: "800" },
});
