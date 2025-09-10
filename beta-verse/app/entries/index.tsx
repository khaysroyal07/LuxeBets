// app/entries/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, StyleSheet, ImageBackground
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";
const DARK   = "#1a1a1a";

const startOfIsoWeekUTC = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay() || 7; // 1..7 (Mon..Sun)
  if (dow > 1) x.setUTCDate(x.getUTCDate() - (dow - 1));
  x.setUTCHours(0,0,0,0);
  return x;
};
const endOfIsoWeekUTC = (d = new Date()) => {
  const s = startOfIsoWeekUTC(d);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 7);
  return e;
};

export default function CurrentEntries() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  const weekStart = useMemo(() => startOfIsoWeekUTC(), []);
  const weekEnd   = useMemo(() => endOfIsoWeekUTC(), []);

  const load = async () => {
    try {
      setRefreshing(true);
      const { data: e, error } = await supabase
        .from("entrants")
        .select(`
          id, tournament_id, status, joined_at,
          tournaments:tournament_id (
            id, week_label, league_name, day_date, join_close_at, start_at, entry_fee
          )
        `)
        .order("joined_at", { ascending: false });

      if (error) throw error;

      const inThisWeek = (e || []).filter((r: any) => {
        const d = r?.tournaments?.day_date ? new Date(r.tournaments.day_date+"T00:00:00Z") : null;
        return d && d >= weekStart && d < weekEnd;
      });

      setRows(inThisWeek);
    } catch (e: any) {
      console.warn(e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView
        contentContainerStyle={{ padding: RFValue(16), paddingBottom: RFValue(120) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#fff" colors={["#613DC1"]} />
        }
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>Current Entries (This Week)</Text>
          <TouchableOpacity onPress={load} style={styles.iconBtn}>
            <Ionicons name="refresh" size={RFValue(20)} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/user/PastEntries")}
          style={styles.pastLink}
        >
          <Text style={styles.pastLinkTxt}>See Past Entries →</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={PURPLE} /></View>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No entries this week.</Text>
        ) : (
          rows.map((r) => {
            const t = r.tournaments || {};
            const title = `${t.week_label || `Week of ${t.day_date}`} • ${t.league_name || "ANY"}`;
            const closes = t.join_close_at ? new Date(t.join_close_at).toLocaleString() : "—";
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.sub}>
                  Day: {t.day_date || "—"}  ·  Closes {closes}  ·  Entry {typeof t.entry_fee === "number" ? `$${t.entry_fee.toFixed(2)}` : "—"}
                </Text>
                <View style={{ height: RFValue(8) }} />
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/entries/[entryId]", params: { entryId: r.id } })}
                  style={styles.openBtn}
                >
                  <Text style={styles.openTxt}>Open / Make Pick</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingTop: RFValue(40) },
  title: { color: "#fff", fontSize: RFValue(20), fontWeight: "900" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: RFValue(8) },
  iconBtn: { height: RFValue(36), width: RFValue(36), alignItems: "center", justifyContent: "center" },
  pastLink: { alignSelf: "flex-start", marginTop: RFValue(8), paddingVertical: RFValue(6), paddingHorizontal: RFValue(10),
              backgroundColor: "rgba(97,61,193,0.25)", borderRadius: RFValue(999), borderWidth: 1, borderColor: PURPLE },
  pastLinkTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },

  card: { backgroundColor: "rgba(0,0,0,0.60)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
          padding: RFValue(14), borderRadius: RFValue(14), marginTop: RFValue(12) },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", fontSize: RFValue(12), marginTop: RFValue(6), lineHeight: RFValue(16) },

  openBtn: { backgroundColor: PURPLE, borderRadius: RFValue(12), paddingVertical: RFValue(10), alignItems: "center" },
  openTxt: { color: "#fff", fontWeight: "900" },

  empty: { color: "#fff", opacity: 0.8, marginTop: RFValue(16), textAlign: "center" },
});
