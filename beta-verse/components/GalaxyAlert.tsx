import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.96)";
const GOLD = "#FFD700";

export default function GalaxyAlert({
  visible,
  title = "Success!",
  message = "",
  buttonText = "OK",
  onClose,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🎉✨</Text>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnTxt}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: RFValue(20),
  },
  card: {
    width: "100%",
    borderRadius: RFValue(18),
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: RFValue(20),
    paddingHorizontal: RFValue(20),
    alignItems: "center",
  },
  emoji: {
    fontSize: RFValue(30),
    marginBottom: RFValue(6),
  },
  title: {
    color: GOLD,
    fontSize: RFValue(16),
    fontWeight: "800",
    marginBottom: RFValue(6),
    textAlign: "center",
  },
  message: {
    color: "rgba(255,255,255,0.85)",
    fontSize: RFValue(12),
    marginBottom: RFValue(16),
    textAlign: "center",
  },
  btn: {
    backgroundColor: GOLD,
    paddingHorizontal: RFValue(18),
    paddingVertical: RFValue(10),
    borderRadius: RFValue(999),
  },
  btnTxt: {
    color: "#000",
    fontWeight: "800",
    fontSize: RFValue(12),
  },
});
