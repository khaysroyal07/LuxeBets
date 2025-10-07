import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

export default function DepositScreen() {
  const [amount, setAmount] = useState("20.00");
  const [loading, setLoading] = useState(false);

  const startDeposit = async () => {
    const dollars = parseFloat(amount || "0");
    if (!isFinite(dollars) || dollars < 1) return Alert.alert("Enter at least $1.00");

    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return Alert.alert("Sign in required", "Please sign in to deposit.");

      const cents = Math.round(dollars * 100);
      const { data, error } = await supabase.functions.invoke("create-wallet-checkout", {
        body: { userId: uid, amount_cents: cents },
      });

      if (error) {
        // Surface full context so we see what's wrong
        const details = (error as any)?.context?.response || (error as any)?.message || error;
        Alert.alert("Edge function failed", JSON.stringify(details, null, 2).slice(0, 1200));
        return;
      }

      if (!data?.checkoutUrl) {
        Alert.alert("No checkout URL", JSON.stringify(data, null, 2));
        return;
      }

      await WebBrowser.openBrowserAsync(data.checkoutUrl);
    } catch (e: any) {
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
      <TouchableOpacity onPress={startDeposit} disabled={loading} style={styles.btn} activeOpacity={0.9}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Deposit with Card</Text>}
      </TouchableOpacity>
      <Text style={styles.note}>
        Sandbox test card: 4111 1111 1111 1111 · any future expiry · any 3-digit CVV · ZIP 10001
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  input: { borderWidth: 1, borderColor: "#bbb", borderRadius: 8, paddingHorizontal: 12, height: 42 },
  btn: { backgroundColor: "#613DC1", height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
  note: { color: "#666", marginTop: 10, fontSize: 12 },
});
