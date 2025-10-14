import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { supabase } from "@/lib/supabase";
import { FUNCTIONS_BASE } from "@/lib/supabase";

type Props = {
  tournamentId: number | string;
  userId: string;
  onClose: () => void;
  onJoined: (entryId: number | string) => void;
};

const GOLD = "#FFD700";

export default function EntriesModal({ tournamentId, onClose, onJoined }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const join = async () => {
    setLoading(true);
    setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert("Sign in required", "Please log in to join tournaments.");
        return;
      }

      // use your underscore function: join_tournament
      const r = await fetch(`${FUNCTIONS_BASE}/join_tournament`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || j?.message || "Join failed");

      // server should create entries.status='active'
      onJoined(j?.entry?.id ?? j?.entry_id ?? "");
    } catch (e: any) {
      setErr(e?.message || "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Join Tournament</Text>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={onClose} disabled={loading}>
          <Text style={styles.btnTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: GOLD }]} onPress={join} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#111" /> : <Text style={[styles.btnTxt, { color: "#111" }]}>Join</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(25,25,25,0.95)", borderRadius: RFValue(16), padding: RFValue(14), borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  title: { color: "#fff", fontFamily: "PoppinsBold", fontSize: RFValue(16), marginBottom: RFValue(8) },
  err: { color: "#ffb4b4", fontFamily: "Poppins", marginBottom: RFValue(6) },
  row: { flexDirection: "row", gap: RFValue(8), justifyContent: "flex-end" },
  btn: { paddingHorizontal: RFValue(12), paddingVertical: RFValue(8), borderRadius: RFValue(10), backgroundColor: "rgba(255,255,255,0.12)" },
  btnTxt: { color: "#fff", fontFamily: "PoppinsMedium" },
});
