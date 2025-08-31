// app/tournaments/TournamentStatus.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, ActivityIndicator, RefreshControl } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function TournamentStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState([]);

  const loadData = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCards([]);
        return;
      }

      // My entries with tournament info (show open/running + most recent)
      const { data: ents, error: e1 } = await supabase
        .from("entrants")
        .select(`
          id, status, joined_at, tournament_id,
          tournaments (
            id, entry_fee, day_date, status, join_open_at, join_close_at, start_at
          )
        `)
        .order("joined_at", { ascending: false });
      if (e1) throw e1;

      const relevant = (ents || []).filter((r) => {
        const t = r.tournaments || {};
        return ["open","running"].includes(t.status) || (t.day_date && t.day_date >= new Date().toISOString().slice(0,10));
      });

      const ids = relevant.map((r) => r.tournament_id);
      let pickMap = {};
      if (ids.length) {
        const { data: picks, error: e2 } = await supabase
          .from("picks")
          .select("tournament_id,status")
          .in("tournament_id", ids)
          .eq("user_id", user.id);
        if (e2) throw e2;
        pickMap = (picks || []).reduce((acc, p) => {
          const key = String(p.tournament_id);
          if (!acc[key]) acc[key] = { WIN: 0, LOSS: 0, PENDING: 0, PUSH: 0, VOID: 0 };
          const s = (p.status || "PENDING").toUpperCase();
          if (acc[key][s] != null) acc[key][s] += 1;
          return acc;
        }, {});
      }

      const cardsOut = relevant.map((r) => {
        const t = r.tournaments || {};
        const fee = Number(t.entry_fee || 0);
        const agg = pickMap[String(r.tournament_id)] || { WIN:0, LOSS:0, PENDING:0, PUSH:0, VOID:0 };
        const eliminated = r.status === "ELIMINATED" || agg.LOSS > 0;

        const openIso = t.join_open_at, closeIso = t.join_close_at;
        const closeText = closeIso ? new Date(closeIso).toLocaleString() : "—";
        const statusLabel = t.status === "open" ? "Open" : t.status === "running" ? "Running" : t.status;

        return {
          entryId: r.id,
          tournamentId: t.id,
          name: TIER_TO_PLANET[String(fee)] || `Tournament $${fee}`,
          fee,
          closes: closeText,
          statusLabel,
          wins: agg.WIN, losses: agg.LOSS, pending: agg.PENDING,
          eliminated,
        };
      });

      setCards(cardsOut);
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { loadData(true); }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(false)}
            tintColor="#fff"
            colors={["#613DC1"]}
          />
        }
      >
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Your Tournament Status</Text>
          <TouchableOpacity onPress={() => loadData(false)} style={styles.refreshBtn} activeOpacity={0.85}>
            <Ionicons name="refresh" size={RFValue(16)} color="#fff" />
            <Text style={styles.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {cards.length === 0 && <Text style={styles.empty}>No active entries.</Text>}

        {cards.map((c) => (
          <View key={c.entryId} style={styles.card}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.sub}>Entry: <Text style={{ color: GOLD }}>{fmtMoney(c.fee)}</Text></Text>
            <Text style={styles.sub}>Join Closes: {c.closes} • Status: <Text style={{ color: GOLD }}>{c.statusLabel}</Text></Text>

            {/* Progress pills */}
            <View style={styles.pills}>
              <Pill color="#22c55e" label="Correct" value={c.wins} />
              <Pill color="#f59e0b" label="Pending" value={c.pending} />
              <Pill color="#ef4444" label="Wrong" value={c.losses} />
            </View>

            {/* Elimination banner */}
            {c.eliminated ? (
              <View style={[styles.banner, { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444" }]}>
                <Text style={[styles.bannerText, { color: "#ef4444" }]}>Eliminated</Text>
              </View>
            ) : (
              <View style={[styles.banner, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" }]}>
                <Text style={[styles.bannerText, { color: "#22c55e" }]}>Still Alive</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => router.push("/entries")} style={styles.manageBtn}>
              <Text style={styles.manageTxt}>Manage Picks</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ImageBackground>
  );
}

function Pill({ color, label, value }) {
  return (
    <View style={[pillStyles.pill, { borderColor: color, backgroundColor: "rgba(255,255,255,0.05)" }]}>
      <Text style={[pillStyles.val, { color }]}>{value}</Text>
      <Text style={pillStyles.lab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: RFValue(12) },
  title: { fontSize: RFValue(22), fontWeight: "900", color: "#fff" },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: RFValue(6), backgroundColor: "#613DC1", paddingHorizontal: RFValue(12), paddingVertical: RFValue(6), borderRadius: RFValue(10) },
  refreshTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },
  empty: { color: "#ddd", marginTop: RFValue(8) },

  card: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: RFValue(16), padding: RFValue(16), marginBottom: RFValue(12), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", marginTop: RFValue(6), fontSize: RFValue(12) },

  pills: { flexDirection: "row", gap: RFValue(10), marginTop: RFValue(12) },
  banner: { marginTop: RFValue(12), padding: RFValue(10), borderRadius: RFValue(10), borderWidth: 1, alignItems: "center" },
  bannerText: { fontWeight: "900" },

  manageBtn: { backgroundColor: PURPLE, paddingVertical: RFValue(10), borderRadius: RFValue(12), alignItems: "center", marginTop: RFValue(12) },
  manageTxt: { color: "#fff", fontWeight: "900" },
});

const pillStyles = StyleSheet.create({
  pill: { flexDirection: "column", alignItems: "center", borderRadius: RFValue(10), borderWidth: 1, paddingVertical: RFValue(8), paddingHorizontal: RFValue(12), minWidth: RFValue(90) },
  val: { fontSize: RFValue(16), fontWeight: "900" },
  lab: { color: "#ddd", fontSize: RFValue(11), marginTop: RFValue(2) },
});
