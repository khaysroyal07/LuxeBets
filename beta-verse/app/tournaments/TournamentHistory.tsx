// app/tournaments/TournamentHistory.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

const TIER_TO_PLANET = { "20": "Tournament of Mars", "50": "Tournament of Jupiter", "100": "Tournament of Saturn" };
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function TournamentHistory() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);

  const loadData = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      // who am i
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRows([]);
        return;
      }

      // My entrants with tournaments (past or settled)
      const today = new Date().toISOString().slice(0, 10);
      const { data: ents, error: e1 } = await supabase
        .from("entrants")
        .select(`
          id, status, joined_at, tournament_id,
          tournaments (
            id, entry_fee, day_date, status, join_close_at, start_at
          )
        `)
        .order("joined_at", { ascending: false });
      if (e1) throw e1;

      const past = (ents || []).filter((r) => {
        const t = r.tournaments || {};
        return (t.day_date && t.day_date < today) || ["settled","cancelled"].includes(t.status);
      });

      const ids = past.map((r) => r.tournament_id);
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

      const out = past.map((r) => {
        const t = r.tournaments || {};
        const fee = Number(t.entry_fee || 0);
        const agg = pickMap[String(r.tournament_id)] || { WIN:0, LOSS:0, PENDING:0, PUSH:0, VOID:0 };
        let result = "Finished";
        if (t.status === "cancelled") result = "Cancelled";
        else if (r.status === "ELIMINATED" || agg.LOSS > 0) result = "Eliminated";
        else if (t.status === "settled") result = "Winner / Split";
        else if (agg.PENDING > 0) result = "Pending";

        return {
          id: r.id,
          tournamentId: t.id,
          name: TIER_TO_PLANET[String(fee)] || `Tournament $${fee}`,
          entryFee: fee,
          date: t.day_date,
          statusText: t.status,
          result,
          wins: agg.WIN,
          losses: agg.LOSS,
          pending: agg.PENDING,
        };
      });

      setRows(out);
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
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={rows}
        keyExtractor={(it) => String(it.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(false)}
            tintColor="#fff"
            colors={["#613DC1"]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tournament History</Text>
            <View style={{ flexDirection: "row", gap: RFValue(8) }}>
              <TouchableOpacity onPress={() => loadData(false)} style={styles.refreshBtn} activeOpacity={0.85}>
                <Ionicons name="refresh" size={RFValue(16)} color="#fff" />
                <Text style={styles.refreshTxt}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.line}>
              Entry: <Text style={{ color: GOLD }}>{fmtMoney(item.entryFee)}</Text> · Date: {item.date}
            </Text>
            <Text style={styles.line}>
              Result: <Text style={{ color: item.result.includes("Winner") ? GOLD : "#ddd" }}>{item.result}</Text>
              {"  "}• Wins: {item.wins}  • Losses: {item.losses}  • Pending: {item.pending}
            </Text>
            <Text style={styles.line}>Status: {item.statusText}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#ddd" }}>No history yet.</Text>}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: RFValue(10) },
  title: { color: "#fff", fontWeight: "900", fontSize: RFValue(22) },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: RFValue(6), backgroundColor: "#613DC1", paddingHorizontal: RFValue(12), paddingVertical: RFValue(6), borderRadius: RFValue(10) },
  refreshTxt: { color: "#fff", fontWeight: "800", fontSize: RFValue(12) },

  card: { backgroundColor: "rgba(0,0,0,0.6)", padding: RFValue(16), borderRadius: RFValue(16), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, marginBottom: RFValue(10) },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16), marginBottom: RFValue(6) },
  line: { color: "#ddd", fontSize: RFValue(12), marginTop: RFValue(2) },
});
