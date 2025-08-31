// app/entries/index.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, TouchableOpacity } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const GOLD = "#FFD700";

export default function EntriesIndex() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        // Join your entries with tournament info
        const { data, error } = await supabase
          .from("tournament_entries")
          .select("id, tournament_id, tournaments(*)")
          .order("joined_at", { ascending: false });
        if (error) throw error;
        if (on) setEntries(data || []);
      } catch (e) {
        console.warn(e);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#613DC1" size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <View style={{ padding: RFValue(16), paddingTop: RFValue(44) }}>
        <Text style={styles.title}>Current Entries</Text>
        {entries.length === 0 && <Text style={styles.empty}>No entries yet. Join a tournament to begin.</Text>}

        {entries.map((e) => {
          const t = e.tournaments;
          const name = t?.name || "Tournament";
          return (
            <TouchableOpacity key={e.id} style={styles.card} onPress={() => router.push(`/entries/${e.id}`)}>
              <Text style={styles.name}>{name} • {String(t?.sport || "").toUpperCase()}</Text>
              <Text style={styles.sub}>
                Window: {t?.window_start} → {t?.window_end} · Closes {new Date(t?.close_at).toLocaleString()}
              </Text>
              <Text style={styles.cta}>Make / Edit Picks →</Text>
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
  name: { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  sub: { color: "#ccc", marginTop: RFValue(6), fontSize: RFValue(12) },
  cta: { color: GOLD, marginTop: RFValue(8), fontWeight: "800" },
});
