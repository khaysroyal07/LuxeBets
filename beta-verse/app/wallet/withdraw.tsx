import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ImageBackground,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { supabase } from "@/lib/supabase";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const INK = "#0E0A12";

export default function WithdrawScreen() {
  const [amount, setAmount] = useState("10.00");
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });
  if (!fontsLoaded) return null;

  const submit = async () => {
    const dollars = parseFloat(amount || "0");
    if (!isFinite(dollars) || dollars <= 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    const cents = Math.round(dollars * 100);

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      Alert.alert("Auth error", authErr.message);
      return;
    }
    const uid = auth.user?.id;
    if (!uid) {
      Alert.alert("Sign in required");
      return;
    }

    const { error } = await supabase.from("withdraw_requests").insert({
      user_id: uid,
      amount_cents: cents,
      status: "pending",
    });

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert(
      "Request submitted",
      "We’ll process your withdrawal soon."
    );
    router.back();
  };

  return (
    <ImageBackground source={BG} style={styles.bg} imageStyle={{ opacity: 0.6 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Withdraw</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cardWrap}>
        <LinearGradient
          colors={["#2C0735", PURPLE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.label}>Amount to withdraw</Text>
          <View style={styles.inputRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          <Text style={styles.hint}>
            Withdrawals are processed manually while we’re in beta.
          </Text>

          <TouchableOpacity
            onPress={submit}
            style={styles.btn}
            activeOpacity={0.9}
          >
            <Ionicons name="download-outline" size={18} color={INK} />
            <Text style={styles.btnText}>Request Withdrawal</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: INK },
  header: {
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: "PoppinsBold",
    fontSize: 18,
    color: "#fff",
  },
  cardWrap: { paddingHorizontal: 18, marginTop: 10 },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  label: {
    fontFamily: "PoppinsMedium",
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "rgba(10,10,20,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dollar: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 20,
    color: GOLD,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: "PoppinsBold",
    fontSize: 24,
    color: "#fff",
    paddingVertical: 4,
  },
  hint: {
    fontFamily: "Poppins",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },
  btn: {
    marginTop: 16,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
    color: INK,
  },
});
