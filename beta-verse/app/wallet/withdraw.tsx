// app/wallet/withdraw.tsx
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function WithdrawScreen() {
  const [amount, setAmount] = useState("10.00");
  const submit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("withdraw_requests").insert({
      user_id: user.user?.id,
      amount_cents: cents,
      status: "pending",
    });
    if (error) return Alert.alert("Error", error.message);
    Alert.alert("Request submitted", "We’ll process your withdrawal soon.");
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>Withdraw to Bank</Text>
      <TextInput keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={{ borderWidth: 1, padding: 10, marginVertical: 10 }} />
      <TouchableOpacity onPress={submit} style={{ padding: 14, backgroundColor: "#FFD700", borderRadius: 10 }}>
        <Text style={{ textAlign: "center" }}>Request Withdrawal</Text>
      </TouchableOpacity>
    </View>
  );
}
