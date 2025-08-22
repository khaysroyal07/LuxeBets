import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ImageBackground,
  ActivityIndicator,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
//test
// Mock tournaments
const mockTournaments = [
  {
    id: "1",
    name: "NFL Week 3",
    entryFee: 20,
    games: [
      { idEvent: "101", strHomeTeam: "Patriots", strAwayTeam: "Cowboys" },
      { idEvent: "102", strHomeTeam: "Packers", strAwayTeam: "Vikings" },
    ],
  },
  {
    id: "2",
    name: "NBA Week 5",
    entryFee: 50,
    games: [
      { idEvent: "201", strHomeTeam: "Lakers", strAwayTeam: "Celtics" },
      { idEvent: "202", strHomeTeam: "Bulls", strAwayTeam: "Heat" },
    ],
  },
];

export default function TournamentPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [picks, setPicks] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setTimeout(() => {
      setTournaments(mockTournaments);
      setLoading(false);
    }, 1000);
  }, []);

  const joinTournament = (tournament) => {
    setSelectedTournament(tournament);
    setPicks({});
    setModalVisible(true);
  };

  const handlePick = (gameId, team) => {
    setPicks((prev) => ({ ...prev, [gameId]: team }));
  };

  const submitPicks = () => {
    console.log("User picks for tournament", selectedTournament.name, picks);
    setModalVisible(false);
  };

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
      <ScrollView
        contentContainerStyle={{
          marginTop: RFValue(65),
          paddingBottom: RFValue(50),
          paddingHorizontal: RFValue(16),
        }}
      >
        {/* Top Row with Title + Dropdown */}
        <View style={styles.topRow}>
          <Text style={styles.title}>Available Tournaments</Text>
          <View style={{ position: "relative" }}>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setDropdownOpen(!dropdownOpen)}
            >
              <Text style={styles.dropdownText}>⋮</Text>
            </TouchableOpacity>

            {dropdownOpen && (
              <View style={styles.dropdownMenu}>
                <TouchableOpacity
                  onPress={() => {
                    setDropdownOpen(false);
                    router.push("tournaments/TournamentHistory");
                  }}
                >
                  <Text style={styles.dropdownItem}>View History</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setDropdownOpen(false);
                    router.push("tournaments/Status");
                  }}
                >
                  <Text style={styles.dropdownItem}>Tournament Status</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {tournaments.map((item) => (
          <View key={item.id} style={styles.tournamentCard}>
            <Text style={styles.tournamentName}>{item.name}</Text>
            <Text style={styles.tournamentText}>Entry Fee: ${item.entryFee}</Text>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => joinTournament(item)}
            >
              <Text style={styles.joinText}>Join Tournament</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Picks Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <ScrollView contentContainerStyle={styles.overlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>
                Make Picks: {selectedTournament?.name}
              </Text>

              {selectedTournament?.games.map((game) => (
                <View key={game.idEvent} style={styles.gameRow}>
                  <Text style={styles.team}>{game.strHomeTeam}</Text>
                  <TouchableOpacity
                    style={[
                      styles.pickButton,
                      picks[game.idEvent] === "Home" && styles.selectedPick,
                    ]}
                    onPress={() => handlePick(game.idEvent, "Home")}
                  >
                    <Text style={styles.pickText}>Pick</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pickButton,
                      picks[game.idEvent] === "Away" && styles.selectedPick,
                    ]}
                    onPress={() => handlePick(game.idEvent, "Away")}
                  >
                    <Text style={styles.pickText}>Pick</Text>
                  </TouchableOpacity>
                  <Text style={styles.team}>{game.strAwayTeam}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.submitButton}
                onPress={submitPicks}
              >
                <Text style={styles.submitText}>Submit Picks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Modal>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: RFValue(16),
  },
  dropdownBtn: {
  height: RFValue(36), // set a fixed height
  width: RFValue(36),  // make it square
  justifyContent: "center",
  alignItems: "center",
  padding: 0,          // remove default padding
},
dropdownText: { 
  fontSize: RFValue(24), 
  color: "#fff",
  textAlign: "center",
  includeFontPadding: false, // improves vertical centering on Android
  textAlignVertical: "center" // ensures vertical centering
},
    dropdownMenu: {
    position: "absolute",
    top: RFValue(32),
    right: 0,
    backgroundColor: "#222",
    borderRadius: RFValue(12),
    padding: RFValue(8),
    zIndex: 10,
  },
  dropdownItem: {
    color: "#fff",
    paddingVertical: RFValue(6),
    fontSize: RFValue(14),
      width:150,

  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: RFValue(22), fontWeight: "700", color: "#fff" },
  tournamentCard: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: RFValue(16),
    marginVertical: RFValue(8),
    borderRadius: RFValue(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  tournamentName: {
    fontSize: RFValue(18),
    fontWeight: "700",
    color: "#fff",
    marginBottom: RFValue(6),
  },
  tournamentText: { color: "#ddd", marginBottom: RFValue(6) },
  joinButton: {
    marginTop: RFValue(8),
    backgroundColor: "#613DC1",
    padding: RFValue(10),
    borderRadius: RFValue(12),
    alignItems: "center",
  },
  joinText: { color: "#fff", fontWeight: "700" },
  overlay: {
    flexGrow: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: RFValue(50),
  },
  modalContainer: {
    width: "90%",
    backgroundColor: "#1a1a1a",
    borderRadius: RFValue(16),
    padding: RFValue(16),
  },
  modalTitle: {
    fontSize: RFValue(18),
    fontWeight: "700",
    color: "#fff",
    marginBottom: RFValue(12),
    textAlign: "center",
  },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: RFValue(8),
  },
  team: { fontSize: RFValue(14), color: "#fff", flex: 2, textAlign: "center" },
  pickButton: {
    padding: RFValue(6),
    backgroundColor: "#444",
    borderRadius: RFValue(6),
    marginHorizontal: RFValue(4),
  },
  selectedPick: { backgroundColor: "#613DC1" },
  pickText: { color: "#fff", fontWeight: "600" },
  submitButton: {
    backgroundColor: "#2c91a1",
    padding: RFValue(12),
    borderRadius: RFValue(12),
    marginTop: RFValue(12),
  },
  submitText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  closeButton: { padding: RFValue(10), marginTop: RFValue(8) },
  closeText: { color: "#613DC1", textAlign: "center", fontWeight: "700" },
});
