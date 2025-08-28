import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";

// Mock user tournaments
const mockUserTournaments = [
  { id: "1", name: "NFL Week 3", status: "3/4 games correct" },
  { id: "2", name: "NBA Week 5", status: "Pending" },
];

export default function TournamentStatus() {
  const router = useRouter();

  return (
    <ImageBackground
      source={require('@/assets/images/bgDash.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={{marginTop: RFValue(36), padding: RFValue(16), paddingBottom: RFValue(50) }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Your Entries</Text>

        {mockUserTournaments.map((t) => (
          <View key={t.id} style={styles.card}>
            <Text style={styles.tournamentName}>{t.name}</Text>
            <Text style={styles.tournamentStatus}>{t.status}</Text>
          </View>
        ))}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  backButton: { marginBottom: RFValue(12) },
  backText: { color: "#613DC1", fontWeight: "700", fontSize: RFValue(16) },
  title: { fontSize: RFValue(22), fontWeight: "700", color: "#fff", marginBottom: RFValue(16) },
  card: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: RFValue(16),
    marginVertical: RFValue(8),
    borderRadius: RFValue(16),
  },
  tournamentName: { fontSize: RFValue(18), fontWeight: "700", color: "#fff", marginBottom: RFValue(4) },
  tournamentStatus: { color: "#ddd", fontSize: RFValue(14) },
});
