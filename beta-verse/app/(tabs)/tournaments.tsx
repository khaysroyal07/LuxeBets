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
import { supabase, FUNCTIONS_BASE, SUPABASE_ANON_KEY } from "@/lib/supabase";

// Try underscore first, then hyphen (both supported)
const JOIN_FN_PATHS = ["/join_tournament", "/join-tournament"];

/** ---------------- Theme & Config ---------------- */
const GOLD = "#FFD700";
const PURPLE = "#613DC1";
const DARK = "#1a1a1a";

const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const PROMO_CODES = { LUXE10: 10, VIP20: 20, BETA30: 30 }; // client stub

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

const timeUntil = (futureMs) => {
  const diff = futureMs - Date.now();
  if (diff <= 0) return "now";
  const min = Math.floor(diff / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
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

  // simple ticker to update countdown text
  const tickRef = useRef(null);

  const loadTournaments = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      // Include Authorization if user is logged in (prevents 401)
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        apikey: SUPABASE_ANON_KEY,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      // Edge function returns from view v_tournament_counts (or direct select)
      const { data: listData, error: listErr } = await supabase.functions.invoke(
        "list_tournaments",
        { headers }
      );
      if (listErr) throw new Error(listErr.message || "Failed to load tournaments");
      const tourneys = Array.isArray(listData?.tournaments) ? listData.tournaments : [];

      // Which tournaments I joined
      const { data: entries, error: eErr } = await supabase
        .from("entrants")
        .select("tournament_id");
      if (eErr) throw eErr;

      setTournaments(tourneys);
      setJoinedIds(new Set(entries?.map((e) => e.tournament_id) || []));
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to load tournaments");
    } finally {
      setRefreshing(false);
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadTournaments(true);
  }, []);

  useEffect(() => {
    tickRef.current && clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTournaments((t) => [...t]), 30000);
    return () => clearInterval(tickRef.current);
  }, []);

  /** Manual open of the join modal */
  const openJoin = (t) => {
    const fee = Number(t.entry_fee || 0);
    setSelectedT({
      ...t,
      tier: String(fee),
      displayName: TIER_TO_PLANET[String(fee)] || t.name || `Tournament $${fee}`,
      fee,
      sport: "ANY",
    });
    setPromoInput("");
    setAppliedPromo(null);
    setJoinOpen(true);
  };

  const entryFee = useMemo(() => selectedT?.fee || 0, [selectedT]);
  const discountPct = useMemo(() => (appliedPromo ? PROMO_CODES[appliedPromo] || 0 : 0), [appliedPromo]);
  const discounted = useMemo(() => Math.max(0, entryFee - entryFee * (discountPct / 100)), [entryFee, discountPct]);

  const applyPromo = () => {
    const code = String(promoInput || "").trim().toUpperCase();
    if (!code) return;
    if (!PROMO_CODES[code]) return Alert.alert("Invalid Code", "That promo code isn’t recognized.");
    setAppliedPromo(code);
  };
  const removePromo = () => { setAppliedPromo(null); setPromoInput(""); };

  const confirmJoin = async () => {
    try {
      setBusyJoin(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setBusyJoin(false);
        return Alert.alert("Sign in required", "Please log in to join tournaments.");
      }

      const fnBase =
        FUNCTIONS_BASE ||
        Constants?.expoConfig?.extra?.FUNCTIONS_URL ||
        Constants?.manifest2?.extra?.FUNCTIONS_URL ||
        "";
      if (!fnBase) throw new Error("Missing FUNCTIONS_BASE / FUNCTIONS_URL.");

      let ok = false;
      let lastErr = null;

      for (const path of JOIN_FN_PATHS) {
        try {
          const res = await fetch(`${fnBase}${path}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ tournament_id: selectedT.id }),
          });
          const j = await res.json().catch(() => ({}));
          if (res.ok && (j?.ok || j?.alreadyJoined)) {
            ok = true;
            break;
          } else {
            lastErr = new Error(j?.error || j?.message || `Join failed (${res.status})`);
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!ok) throw lastErr || new Error("Join failed");

      setJoinOpen(false);
      setJoinedConfirmOpen(true);
      setJoinedIds((prev) => new Set([...Array.from(prev), selectedT.id]));
    } catch (e) {
      Alert.alert("Unable to join", e.message || "Please try again.");
    } finally {
      setBusyJoin(false);
    }
  };

  const openStatus = async (t) => {
    try {
      setStatusOpen(true);
      setStatusBusy(true);
      const entrants = typeof t.entrants_total === "number" ? t.entrants_total : null;
      const fee = Number(t.entry_fee || 0);
      const prizePool = entrants != null ? entrants * fee : null;

      const openIso = t.join_open_at;
      const closeIso = t.join_close_at || t.end_at;
      const now = Date.now();
      const openMs = openIso ? new Date(openIso).getTime() : null;
      const closeMs = closeIso ? new Date(closeIso).getTime() : null;

      const isOpen =
        t.status === "open" &&
        (openMs == null || now >= openMs) &&
        (closeMs == null || now < closeMs);

      const status = isOpen ? "Open" : (openMs && now < openMs) ? "Opens Soon" : "Locked";

      setStatusData({
        id: t.id,
        name: TIER_TO_PLANET[String(fee)] || t.name || `Tournament $${fee}`,
        sport: "ANY",
        entryFee: fee,
        status,
        closesAt: closeIso,
        closesIn: closeMs ? timeUntil(closeMs) : "—",
        opensAt: openIso,
        opensIn: openMs ? timeUntil(openMs) : "—",
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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    );
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={styles.background} resizeMode="cover">
      <ScrollView
        contentContainerStyle={{ marginTop: RFValue(65), paddingBottom: RFValue(200), paddingHorizontal: RFValue(16) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTournaments(false)}
            tintColor="#fff"
            colors={["#613DC1"]}
          />
        }
      >
        {/* Top (title + menu only) */}
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
            Opens every <Text style={{ color: GOLD }}>Tuesday</Text> · join within{" "}
            <Text style={{ color: GOLD }}>3 days</Text>.{"\n"}
            <Text style={{ color: GOLD }}>Closes 30m</Text> before first game.
          </Text>
        </View>
     {/* Centered badges row */}
        <View style={styles.badgesRow}>
          {/* Current Entries badge */}
          <TouchableOpacity onPress={() => router.push("/entries")} activeOpacity={0.9}>
            <LinearGradient
              colors={["#FFE98B", "#FFD700"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.badge, styles.badgeGold]}
            >
              <Ionicons name="trophy-outline" size={RFValue(16)} color="#111" />
              <Text style={styles.badgeGoldText}>Current Entries</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Refresh badge */}
          <TouchableOpacity
            onPress={() => loadTournaments(false)}
            activeOpacity={0.9}
            disabled={refreshing}
            style={{ opacity: refreshing ? 0.65 : 1 }}
          >
            <LinearGradient
              colors={["#7A68E9", "#613DC1"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.badge, styles.badgePurple]}
            >
              {refreshing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="refresh" size={RFValue(16)} color="#fff" />
              )}
              <Text style={styles.badgePurpleText}>{refreshing ? "Refreshing…" : "Refresh"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Cards */}
        {tournaments?.length ? tournaments.map((t) => {
          const fee = Number(t.entry_fee || 0);
          const planet = TIER_TO_PLANET[String(fee)] || t.name || `Tournament $${fee}`;

          const openIso = t.join_open_at;
          const closeIso = t.join_close_at || t.end_at;

          const now = Date.now();
          const openMs = openIso ? new Date(openIso).getTime() : null;
          const closeMs = closeIso ? new Date(closeIso).getTime() : null;

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
                <Text style={styles.cardTitle}>{planet} • ANY</Text>
                <TouchableOpacity onPress={() => openStatus(t)} style={styles.iconBtnSmall}>
                  <Ionicons name="stats-chart" size={RFValue(18)} color={GOLD} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sub}>
                Entry: <Text style={{ color: GOLD }}>{fmtMoney(fee)}</Text>{" "}
                · Join Window:{" "}
                {openIso ? new Date(openIso).toLocaleString() : "—"} → {closeIso ? new Date(closeIso).toLocaleString() : "—"}
              </Text>
              <Text style={styles.countdown}>{statusLine}</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  disabled={joinDisabled}
                  onPress={() => openJoin(t)}
                  style={[styles.joinBtn, joinDisabled && { backgroundColor: "#555" }]}
                >
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
              Join {TIER_TO_PLANET[selectedT?.tier] || selectedT?.displayName} ({String(selectedT?.sport || "").toUpperCase()})
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

            <Text style={styles.disclaimer}>
              This will be withdrawn from your funds (payments wiring later).
            </Text>

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
                  {statusData.name} • {statusData.sport}
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

/** ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  background: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: RFValue(16) },
  title: { fontSize: RFValue(22), fontWeight: "700", color: "#fff" },
  iconBtn: { height: RFValue(36), width: RFValue(36), alignItems: "center", justifyContent: "center" },

  dropdownMenu: { position: "absolute", top: RFValue(32), right: 0, backgroundColor: "#222", borderRadius: RFValue(12), padding: RFValue(8), zIndex: 10 },
  dropdownItem: { color: "#fff", paddingVertical: RFValue(6), fontSize: RFValue(14), width: RFValue(190) },

  /* Centered badges row */
  badgesRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: RFValue(10),
    marginTop: RFValue(10),
    marginBottom: RFValue(4),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(6),
    paddingHorizontal: RFValue(12),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  badgeGold: { borderColor: "rgba(0,0,0,0.08)" },
  badgePurple: { borderColor: "rgba(255,255,255,0.18)" },
  badgeGoldText: { color: "#111", fontWeight: "900", fontSize: RFValue(12) },
  badgePurpleText: { color: "#fff", fontWeight: "900", fontSize: RFValue(12) },

  infoBanner: { backgroundColor: "rgba(0,0,0,0.55)", padding: RFValue(12), borderRadius: RFValue(12), marginTop: RFValue(12), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  infoText: { color: "#fff", fontSize: RFValue(12), lineHeight: RFValue(16) },

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
