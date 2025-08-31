// app/entries/index.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, TouchableOpacity } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";

const nameFor = (t) => t?.week_label || (t?.entry_fee ? `Tournament $${t.entry_fee}` : "Tournament");

export default function EntriesIndex() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        // your entries joined with tournaments
        const { data, error } = await supabase
          .from("entrants")
          .select("id, joined_at, status, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;
        if (on) setRows(data || []);
      } catch (e) {
        console.warn(e);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  if (loading) {
    return <View style={styles.center}>
      <ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>

      <View style={{ padding: RFValue(16), paddingTop: RFValue(44) }}>
              <TouchableOpacity onPress={() => router.push('../(tabs)/tournaments')}><Text style={{marginTop: RFValue(50),marginBottom: RFValue(20), color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) }}>← Back</Text></TouchableOpacity>

        <Text style={styles.title}>Current Entries</Text>
        {rows.length === 0 && <Text style={styles.empty}>No entries yet. Join a tournament to begin.</Text>}

        {rows.map((e) => {
          const t = e.tournaments;
          const title = `${nameFor(t)} • ANY`;
          const windowStr = `${t?.day_date ?? "—"}  ·  Starts ${t?.start_at ? new Date(t.start_at).toLocaleString() : "—"}`;
          return (
            <TouchableOpacity key={e.id} style={styles.card} onPress={() => router.push(`/entries/${e.id}`)}>
              <View style={styles.cardTop}>
                <Ionicons name="trophy-outline" size={RFValue(18)} color={GOLD} />
                <Text style={styles.name}>{title}</Text>
              </View>
              <Text style={styles.sub}>{windowStr}</Text>
              <Text style={styles.cta}>Make / Edit Pick →</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontWeight: "800", fontSize: RFValue(22), marginBottom: RFValue(10) },
  empty: { color: "#ddd", marginTop: RFValue(8) },
  card: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: RFValue(14), padding: RFValue(14), marginBottom: RFValue(10), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: RFValue(8) },
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", marginTop: RFValue(6), fontSize: RFValue(12) },
  cta: { color: GOLD, marginTop: RFValue(8), fontWeight: "800" },
});
