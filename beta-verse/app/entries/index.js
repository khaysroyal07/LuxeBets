// app/entries/index.js
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, RefreshControl, ScrollView
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function EntriesIndex() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState([]);

  const load = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      const { data: ents, error } = await supabase
        .from("entrants")
        .select(`
          id, status, joined_at, tournament_id,
          tournaments (
            id, entry_fee, status, day_date, join_open_at, join_close_at
          )
        `)
        .order("joined_at", { ascending: false });
      if (error) throw error;

      setEntries(ents || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { load(true); }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(false)}
            tintColor="#fff"
            colors={[PURPLE]}
          />
        }
      >
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={RFValue(18)} color={GOLD} />
                    <Text style={styles.backTxt}>Back</Text>
                  </TouchableOpacity>
        {/* Header + Refresh */}
        <View style={styles.headerRow}>
          
          <Text style={styles.title}>Current Entries</Text>
          <TouchableOpacity onPress={() => load(false)} style={styles.refreshBtn} activeOpacity={0.85}>
            <Ionicons name="refresh" size={RFValue(16)} color="#fff" />
            <Text style={styles.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {entries.length === 0 && (
          <Text style={styles.empty}>No entries yet. Join a tournament to begin.</Text>
        )}

        {entries.map((e) => {
          const t = e.tournaments || {};
          const fee = Number(t.entry_fee || 0);
          const name = TIER_TO_PLANET[String(fee)] || `Tournament $${fee}`;
          const locked = t.join_close_at ? Date.now() >= new Date(t.join_close_at).getTime() : false;
          return (
            <TouchableOpacity
              key={e.id}
              style={styles.card}
              onPress={() => router.push(`/entries/${t.id}`)} // use tournamentId route
              activeOpacity={0.9}
            >
              <Text style={styles.name}>{name} • ANY</Text>
              <Text style={styles.sub}>
                Day: {t.day_date || "—"} · Join Closes: {t.join_close_at ? new Date(t.join_close_at).toLocaleString() : "—"}
              </Text>
              <Text style={styles.sub}>
                Entry: <Text style={{ color: GOLD }}>{fmtMoney(fee)}</Text> • Status: {t.status}{e.status === "ELIMINATED" ? " (You’re eliminated)" : ""}
              </Text>
              <Text style={[styles.cta, locked && { opacity: 0.8 }]}>
                {locked ? "Locked – View Picks →" : "Make / Edit Picks →"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: RFValue(10) },
  title: { color: "#fff", fontWeight: "800", fontSize: RFValue(22) },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: RFValue(6), backgroundColor: PURPLE, paddingHorizontal: RFValue(12), paddingVertical: RFValue(6), borderRadius: RFValue(10) },
  refreshTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },

  empty: { color: "#ddd", marginTop: RFValue(8) },
  card: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: RFValue(14), padding: RFValue(14), marginBottom: RFValue(10), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", marginTop: RFValue(6), fontSize: RFValue(12) },
  cta: { color: GOLD, marginTop: RFValue(8), fontWeight: "800" },
});
