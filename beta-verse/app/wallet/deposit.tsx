import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { supabase } from "@/lib/supabase";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const INK = "#0E0A12";

export default function DepositScreen() {
  const [amount, setAmount] = useState("20.00");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });
  if (!fontsLoaded) return null;

  const startDeposit = async () => {
    const dollars = parseFloat(amount || "0");
    if (!isFinite(dollars) || dollars < 1) {
      Alert.alert("Enter at least $1.00");
      return;
    }

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.log("getUser error:", authErr);
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert("Sign in required", "Please sign in to deposit.");
        return;
      }

      setLoading(true);
      const cents = Math.round(dollars * 100);
      console.log("Starting deposit", { uid, cents });

      const { data, error } = await supabase.functions.invoke(
        "wallet_deposit_create",
        { body: { userId: uid, amount_cents: cents } }
      );

      if (error) {
        console.log("invoke error:", error);
        Alert.alert(
          "Edge function failed",
          JSON.stringify(error, null, 2).slice(0, 800)
        );
        return;
      }
      if (!data?.checkoutUrl) {
        Alert.alert("No checkout URL", JSON.stringify(data, null, 2));
        return;
      }

      await WebBrowser.openBrowserAsync(data.checkoutUrl);

      // When Square tab closes, go back to Wallet tab
      router.back();
    } catch (e: any) {
      console.log("Deposit error:", e);
      Alert.alert("Deposit error", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={BG} style={styles.bg} imageStyle={{ opacity: 0.6 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Funds</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cardWrap}>
        <LinearGradient
          colors={["#2C0735", PURPLE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.label}>Enter amount to deposit</Text>
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
            Sandbox card: 4111 1111 1111 1111 · any future expiry · any 3-digit
            CVV · ZIP 10001
          </Text>

          <TouchableOpacity
            onPress={startDeposit}
            disabled={loading}
            style={[styles.btn, loading && { opacity: 0.7 }]}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={INK} />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color={INK} />
                <Text style={styles.btnText}>Deposit with Card</Text>
              </>
            )}
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
