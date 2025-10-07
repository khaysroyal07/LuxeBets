// app/user/singup.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/AuthContext";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, passwordScore } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    dob: "",
    phone: "",
    country: "US",
    state: "",
    username: "",
    referral_code: "",
    termsAccepted: false,
    geoConsent: false,
  });
  const [busy, setBusy] = useState(false);

  const { score, label } = passwordScore(form.password);
  const pwPct = useMemo(() => `${(score / 5) * 100}%`, [score]);

  const onChange = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) return "Use DOB format YYYY-MM-DD.";
    if (!form.email.includes("@")) return "Enter a valid email.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (!form.country) return "Country is required.";
    if (!form.termsAccepted) return "Please accept Terms & Privacy Policy.";
    return null;
  };

  const handleSignUp = async () => {
    const err = validate();
    if (err) return Alert.alert("Check your info", err);
    try {
      setBusy(true);
      await signUp(form);
      Alert.alert("Confirm your email", "We sent a confirmation link. Open it, then log in.");
      router.replace("/user/login");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Top bar (smaller + air around it) */}
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
              <Ionicons name="chevron-back" size={RFValue(20)} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Titles with more breathing room */}
          <View style={styles.headerBlock}>
            <Text style={styles.bigTitle}>Create</Text>
            <Text style={styles.bigTitle}>Account</Text>
            <Text style={styles.subTitle}>Join Beta Verse and get in the game.</Text>
          </View>

          {/* Underlined inputs (no icons/no logo) */}
          <View style={{ width: "100%" }}>
            <Underlined placeholder="Full name" value={form.full_name} onChangeText={(v: string) => onChange("full_name", v)} />
            <Underlined
              placeholder="Date of birth (YYYY-MM-DD)"
              value={form.dob}
              onChangeText={(v: string) => onChange("dob", v)}
              keyboardType="numbers-and-punctuation"
            />
            <Underlined
              placeholder="Username"
              value={form.username}
              onChangeText={(v: string) => onChange("username", v)}
              autoCapitalize="none"
            />
            <Underlined
              placeholder="Email Address"
              value={form.email}
              onChangeText={(v: string) => onChange("email", v)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Underlined
              placeholder="Mobile number"
              value={form.phone}
              onChangeText={(v: string) => onChange("phone", v)}
              keyboardType="phone-pad"
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Underlined
                  placeholder="Country (e.g., US)"
                  value={form.country}
                  onChangeText={(v: string) => onChange("country", v.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ width: 14 }} />
              <View style={{ flex: 1 }}>
                <Underlined
                  placeholder="State (e.g., FL)"
                  value={form.state}
                  onChangeText={(v: string) => onChange("state", v.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Underlined
              placeholder="Referral code (optional)"
              value={form.referral_code}
              onChangeText={(v: string) => onChange("referral_code", v.toUpperCase())}
              autoCapitalize="characters"
            />

            <Underlined
              placeholder="Password"
              value={form.password}
              onChangeText={(v: string) => onChange("password", v)}
              secureTextEntry
              autoCapitalize="none"
            />

            {/* password strength */}
            <View style={{ marginTop: RFValue(8), marginBottom: RFValue(2) }}>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: pwPct }]} />
              </View>
              <Text style={styles.meterText}>Strength: {label} ({score}/5)</Text>
            </View>

            {/* checkboxes, spaced further from inputs */}
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => onChange("geoConsent", !form.geoConsent)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkBox, form.geoConsent && styles.checkOn]} />
              <Text style={styles.checkText}>Allow geo-location (regional compliance)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkRow, { marginTop: RFValue(12) }]}
              onPress={() => onChange("termsAccepted", !form.termsAccepted)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkBox, form.termsAccepted && styles.checkOn]} />
              <Text style={styles.checkText}>I accept Terms & Privacy Policy</Text>
            </TouchableOpacity>
          </View>

          {/* CTA with extra top margin to de-cluster */}
          <TouchableOpacity style={styles.cta} onPress={handleSignUp} disabled={busy} activeOpacity={0.9}>
            <Text style={styles.ctaText}>{busy ? "Creating..." : "Create account ->"}</Text>
          </TouchableOpacity>

          {/* Footer link */}
          <TouchableOpacity onPress={() => router.push("/user/login")} style={{ marginTop: RFValue(12) }}>
            <Text style={styles.footerLink}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function Underlined(props: any) {
  return (
    <View style={{ marginBottom: RFValue(16) }}>
      <TextInput
        {...props}
        placeholderTextColor="rgba(255,255,255,0.8)"
        style={styles.inputLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000" },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: RFValue(18),
    paddingBottom: RFValue(30),
    alignItems: "center",
  },
  topRow: { width: "100%", alignItems: "flex-start" },

  headerBlock: {
    width: "100%",
    marginTop: RFValue(18),           // more air before the title
    marginBottom: RFValue(6),         // less crowding above inputs
  },
  bigTitle: {
    color: "#fff",
    fontSize: RFValue(34),
    fontWeight: "900",
    lineHeight: RFValue(36),
  },
  subTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: RFValue(12),
    marginTop: RFValue(6),
  },

  inputLine: {
    color: "#fff",
    fontSize: RFValue(12),
    paddingVertical: RFValue(7),
    paddingLeft: 0,
    paddingRight: 0,
    borderBottomWidth: 1.2,
    borderBottomColor: "rgba(255,255,255,0.7)",
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: RFValue(2) },

  meterTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  meterFill: { height: 6, backgroundColor: GOLD },
  meterText: { color: "#fff", opacity: 0.85, fontSize: RFValue(10), marginTop: 4 },

  checkRow: { flexDirection: "row", alignItems: "center", marginTop: RFValue(16) },
  checkBox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.7)", marginRight: 10,
  },
  checkOn: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkText: { color: "#fff", opacity: 0.9, fontSize: RFValue(11), flex: 1 },

  cta: {
    marginTop: RFValue(22),           // extra space away from checkboxes
    backgroundColor: "#fff",
    borderRadius: RFValue(16),
    paddingVertical: RFValue(12),
    paddingHorizontal: RFValue(18),
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: { color: "#000", fontWeight: "700", fontSize: RFValue(13) },
  footerLink: { color: GOLD, fontSize: RFValue(12), textAlign: "center" },
});
