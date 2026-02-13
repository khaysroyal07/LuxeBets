// src/components/BiometricGate.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { RFValue } from "react-native-responsive-fontsize";

export function BiometricGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState(!enabled);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !enrolled) {
      setErr("Biometrics not available on this device.");
      setOk(true); // allow user in (or set false if you want hard-block)
      return;
    }

    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock LuxeBets",
      cancelLabel: "Cancel",
      fallbackLabel: "Use Passcode",
      disableDeviceFallback: false,
    });

    if (res.success) setOk(true);
    else setErr("Could not verify. Try again.");
  };

  useEffect(() => {
    if (enabled) run();
  }, [enabled]);

  if (ok) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Locked</Text>
      <Text style={styles.sub}>
        {err ?? "Verify your identity to continue."}
      </Text>
      <TouchableOpacity onPress={run} style={styles.btn}>
        <Text style={styles.btnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: RFValue(18) },
  title: { color: "#fff", fontSize: RFValue(18), fontWeight: "900" },
  sub: { color: "rgba(255,255,255,0.75)", marginTop: RFValue(8), textAlign: "center" },
  btn: {
    marginTop: RFValue(14),
    paddingVertical: RFValue(12),
    paddingHorizontal: RFValue(18),
    borderRadius: RFValue(12),
    backgroundColor: "rgba(255,215,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
  },
  btnText: { color: "#FFD700", fontWeight: "900" },
});
