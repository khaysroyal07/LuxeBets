import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

export default function PicksModal({ visible, onClose, games, onSubmit }) {
  const [picks, setPicks] = useState({}); // {gameId: "Home"/"Away"}

  const handlePick = (gameId, team) => {
    setPicks((prev) => ({ ...prev, [gameId]: team }));
  };

  const submitPicks = () => {
    onSubmit(picks);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.title}>Make Your Picks</Text>
          <FlatList
            data={games}
            keyExtractor={(item) => item.idEvent}
            renderItem={({ item }) => (
              <View style={styles.gameRow}>
                <Text style={styles.team}>{item.strHomeTeam}</Text>
                <TouchableOpacity
                  style={[
                    styles.pickButton,
                    picks[item.idEvent] === "Home" && styles.selectedPick,
                  ]}
                  onPress={() => handlePick(item.idEvent, "Home")}
                >
                  <Text style={styles.pickText}>Pick</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pickButton,
                    picks[item.idEvent] === "Away" && styles.selectedPick,
                  ]}
                  onPress={() => handlePick(item.idEvent, "Away")}
                >
                  <Text style={styles.pickText}>Pick</Text>
                </TouchableOpacity>
                <Text style={styles.team}>{item.strAwayTeam}</Text>
              </View>
            )}
          />
          <TouchableOpacity style={styles.submitButton} onPress={submitPicks}>
            <Text style={styles.submitText}>Submit Picks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  modalContainer: { width: "90%", backgroundColor: "#fff", borderRadius: RFValue(16), padding: RFValue(16) },
  title: { fontSize: RFValue(18), fontWeight: "700", marginBottom: RFValue(12), textAlign: "center" },
  gameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: RFValue(8) },
  team: { flex: 2, textAlign: "center", fontSize: RFValue(14) },
  pickButton: { flex: 1, backgroundColor: "#ccc", paddingVertical: RFValue(6), marginHorizontal: RFValue(4), borderRadius: RFValue(6), alignItems: "center" },
  selectedPick: { backgroundColor: "#613DC1" },
  pickText: { color: "white" },
  submitButton: { backgroundColor: "#2c91a1", padding: RFValue(10), borderRadius: RFValue(8), marginTop: RFValue(12) },
  submitText: { color: "white", textAlign: "center", fontWeight: "700" },
  closeButton: { padding: RFValue(10), marginTop: RFValue(8) },
  closeText: { color: "#613DC1", textAlign: "center", fontWeight: "600" },
});
