import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, ImageBackground } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

// Mock history data
const mockHistory = [
  { id: "1", name: "NFL Week 2", entryFee: 20, result: "Win", date: "2025-08-18" },
  { id: "2", name: "NBA Week 4", entryFee: 50, result: "Loss", date: "2025-08-15" },
];

export default function TournamentHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setTimeout(() => {
      setHistory(mockHistory);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#613DC1" />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("@/assets/images/bgDash.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingBottom: RFValue(50) }}
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.historyCard}>
            <Text style={styles.tournamentName}>{item.name}</Text>
            <Text style={styles.tournamentText}>Entry Fee: ${item.entryFee}</Text>
            <Text style={styles.tournamentText}>Result: {item.result}</Text>
            <Text style={styles.tournamentText}>Date: {item.date}</Text>
          </View>
        )}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  historyCard: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: RFValue(16),
    marginVertical: RFValue(8),
    borderRadius: RFValue(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  tournamentName: { fontSize: RFValue(18), fontWeight: "700", color: "#fff", marginBottom: RFValue(6) },
  tournamentText: { color: "#ddd", marginBottom: RFValue(4) },
});
