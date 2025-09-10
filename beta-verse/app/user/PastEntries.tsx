import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, ImageBackground } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";

const startOfIsoWeekUTC = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay() || 7;
  if (dow > 1) x.setUTCDate(x.getUTCDate() - (dow - 1));
  x.setUTCHours(0,0,0,0);
  return x;
};

export default function PastEntries() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: e, error } = await supabase
          .from("entrants")
          .select(`
            id, tournament_id, status, joined_at,
            tournaments:tournament_id ( id, week_label, league_name, day_date, join_close_at, start_at )
          `)
          .order("joined_at", { ascending: false });

        if (error) throw error;

        const weekStart = startOfIsoWeekUTC();
        const past = (e || []).filter((r: any) => {
          const d = r?.tournaments?.day_date ? new Date(r.tournaments.day_date+"T00:00:00Z") : null;
          return d && d < weekStart;
        });

        setRows(past);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingBottom: RFValue(120) }}>
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "flex-start", padding: RFValue(10) }}>
          <Text style={{ color: PURPLE, fontWeight: "800" }}>← Back</Text>
        </TouchableOpacity>

        <Text style={{ color: "#fff", fontSize: RFValue(20), fontWeight: "900", marginBottom: RFValue(6) }}>
          Past Entries
        </Text>

        {loading ? (
          <View style={{ paddingTop: RFValue(40), alignItems: "center" }}>
            <ActivityIndicator size="large" color={PURPLE} />
          </View>
        ) : rows.length === 0 ? (
          <Text style={{ color: "#fff", opacity: 0.8 }}>No past entries yet.</Text>
        ) : (
          rows.map((r) => {
            const t = r.tournaments || {};
            const title = `${t.week_label || `Week of ${t.day_date}`} • ${t.league_name || "ANY"}`;
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.sub}>Day: {t.day_date || "—"}</Text>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/entries/[entryId]", params: { entryId: r.id } })}
                  style={styles.openBtn}
                >
                  <Text style={styles.openTxt}>View</Text>
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
  card: { backgroundColor: "rgba(0,0,0,0.60)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
          padding: RFValue(14), borderRadius: RFValue(14), marginTop: RFValue(12) },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", fontSize: RFValue(12), marginTop: RFValue(6) },
  openBtn: { backgroundColor: "#333", borderRadius: RFValue(10), paddingVertical: RFValue(8), alignItems: "center", marginTop: RFValue(8) },
  openTxt: { color: "#fff", fontWeight: "800" },
});
