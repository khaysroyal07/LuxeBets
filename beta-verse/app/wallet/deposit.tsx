import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";

export default function DepositScreen() {
  const [amount, setAmount] = useState("20.00");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const startDeposit = async () => {
    const dollars = parseFloat(amount || "0");
    if (!isFinite(dollars) || dollars < 1) {
      Alert.alert("Enter at least $1.00");
      return;
    }

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.log("getUser error:", authErr);
      }
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
        {
          body: { userId: uid, amount_cents: cents },
        }
      );

      if (error) {
        const errAny: any = error;
        console.log("invoke error RAW:", errAny);

        let msg = "Unknown edge function error";

        try {
          const resp: any = errAny.context?.response ?? errAny.context;

          if (resp && typeof resp.json === "function") {
            const body = await resp.json();
            console.log("invoke error BODY:", body);
            msg = JSON.stringify(body, null, 2);
          } else {
            msg = JSON.stringify(errAny, null, 2);
          }
        } catch (parseErr) {
          console.log("Failed to parse error body:", parseErr);
          msg = JSON.stringify(errAny, null, 2);
        }

        Alert.alert("Edge function failed", msg.slice(0, 1200));
        return;
      }

      if (!data?.checkoutUrl) {
        console.log("No checkout URL in response:", data);
        Alert.alert("No checkout URL", JSON.stringify(data, null, 2));
        return;
      }

      // Open Square checkout; this resolves when user closes the tab
      await WebBrowser.openBrowserAsync(data.checkoutUrl);

      // When they close the Square tab, go back to the wallet
      // If this screen was pushed from /wallet, back() will land them there.
      router.back();
      // If you prefer an explicit route and you have app/wallet/index.tsx:
      // router.replace("/wallet");
    } catch (e: any) {
      console.log("Deposit error:", e);
      Alert.alert("Deposit error", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Amount (USD)"
        placeholderTextColor="#999"
        style={styles.input}
      />
      <TouchableOpacity
        onPress={startDeposit}
        disabled={loading}
        style={[styles.btn, loading && { opacity: 0.7 }]}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Deposit with Card</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.note}>
        Sandbox test card: 4111 1111 1111 1111 · any future expiry · any
        3-digit CVV · ZIP 10001
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  btn: {
    backgroundColor: "#613DC1",
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  note: { color: "#666", marginTop: 10, fontSize: 12 },
});
