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
  Image,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";

const BG = require("@/assets/images/bgDash.png");
const PURPLE = "#613DC1";
const GOLD = "#FFD700";

/** ---- Pick lists ---- */

const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "BR", name: "Brazil" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IE", name: "Ireland" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "ZA", name: "South Africa" },
];

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, passwordScore } = useAuth();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    dob: "", // YYYY-MM-DD
    phone: "",
    country: "US",
    state: "",
    username: "",
    referral_code: "",
    termsAccepted: false,
    geoConsent: false,
  });

  const [busy, setBusy] = useState(false);

  // DOB picker
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [dobDate, setDobDate] = useState<Date | null>(null);

  // pickers
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const { score, label } = passwordScore(form.password);
  const pwPct = useMemo(() => `${(score / 5) * 100}%`, [score]);

  const onChange = (k: string, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const formatIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const displayDob = form.dob || "";

  const computeAge = (dobStr: string) => {
    if (!dobStr) return 0;
    const d = new Date(dobStr);
    if (isNaN(d.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  };

  const validate = () => {
    if (!form.first_name.trim()) return "First name is required.";
    if (!form.last_name.trim()) return "Last name is required.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob))
      return "Use DOB format YYYY-MM-DD.";
    const age = computeAge(form.dob);
    if (age < 18) return "You must be 18 or older to use Beta Verse.";
    if (!form.email.includes("@")) return "Enter a valid email.";
    if (form.password.length < 8)
      return "Password must be at least 8 characters.";
    if (!form.country) return "Country is required.";
    // Only require state for US users
    if (form.country === "US" && !form.state)
      return "State is required for US users.";
    if (!form.termsAccepted)
      return "Please accept Terms & Privacy Policy.";
    return null;
  };

  const handleSignUp = async () => {
    const err = validate();
    if (err) return Alert.alert("Check your info", err);

    try {
      setBusy(true);

      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`;

      const payload = {
        email: form.email,
        password: form.password,
        full_name,
        dob: form.dob,
        phone: form.phone,
        country: form.country,
        state: form.state, // stored as state_code in profiles
        username: form.username,
        referral_code: form.referral_code,
        termsAccepted: form.termsAccepted,
        geoConsent: form.geoConsent,
      };

      await signUp(payload as any);

      Alert.alert(
        "Confirm your email",
        "We sent a confirmation link. Open it, then log in."
      );
      router.replace("/user/login");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ✅ Fixed: close DOB picker on both iOS + Android
  const onChangeDob = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "dismissed") {
      setShowDobPicker(false);
      return;
    }

    const picked = date || dobDate || new Date(2000, 0, 1);
    setDobDate(picked);
    const iso = formatIsoDate(picked);
    onChange("dob", iso);

    // Close after selecting a date on ALL platforms
    setShowDobPicker(false);
  };

  // max date: exactly 18 years ago
  const today = new Date();
  const maxDob = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate()
  );

  const selectedStateName =
    US_STATES.find((s) => s.code === form.state)?.name || "";
  const selectedCountryName =
    COUNTRIES.find((c) => c.code === form.country)?.name || "";

  const isUS = form.country === "US";

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top row / back */}
          <View style={styles.topRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.back_btn}
            >
              <Image
                style={styles.back_img}
                source={require("@/assets/images/back.png")}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View style={styles.headerBlock}>
            <Text style={styles.bigTitle}>Create Account</Text>
            <Text style={styles.subTitle}>
              Join Beta Verse and get in the game.
            </Text>
          </View>

          {/* Form */}
          <View style={{ width: "100%" }}>
            {/* First / Last name */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Underlined
                  placeholder="First name"
                  value={form.first_name}
                  onChangeText={(v: string) => onChange("first_name", v)}
                />
              </View>
              <View style={{ width: RFValue(16) }} />
              <View style={{ flex: 1 }}>
                <Underlined
                  placeholder="Last name"
                  value={form.last_name}
                  onChangeText={(v: string) => onChange("last_name", v)}
                />
              </View>
            </View>

            {/* DOB picker */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowDobPicker(true)}
            >
              <View pointerEvents="none">
                <Underlined
                  placeholder="Date of birth (YYYY-MM-DD)"
                  value={displayDob}
                  editable={false}
                />
              </View>
            </TouchableOpacity>

            {/* Username / email / phone */}
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

            {/* Country + State pickers */}
            <View style={styles.row}>
              {/* Country picker */}
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <View pointerEvents="none">
                    <Underlined
                      placeholder="Country"
                      value={
                        form.country
                          ? `${form.country}${
                              selectedCountryName
                                ? " • " + selectedCountryName
                                : ""
                            }`
                          : ""
                      }
                      editable={false}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Only show State if country is US */}
              {isUS && (
                <>
                  <View style={{ width: RFValue(16) }} />
                  {/* State picker */}
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowStatePicker(true)}
                    >
                      <View pointerEvents="none">
                        <Underlined
                          placeholder="State"
                          value={
                            form.state
                              ? `${form.state}${
                                  selectedStateName
                                    ? " • " + selectedStateName
                                    : ""
                                }`
                              : ""
                          }
                          editable={false}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Referral code */}
            <Underlined
              placeholder="Referral code (optional)"
              value={form.referral_code}
              onChangeText={(v: string) =>
                onChange("referral_code", v.toUpperCase())
              }
              autoCapitalize="characters"
            />

            {/* Password */}
            <Underlined
              placeholder="Password"
              value={form.password}
              onChangeText={(v: string) => onChange("password", v)}
              secureTextEntry
              autoCapitalize="none"
            />

            {/* Password strength */}
            <View style={styles.meterWrapper}>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: pwPct }]} />
              </View>
              <Text style={styles.meterText}>
                Strength: {label} ({score}/5)
              </Text>
            </View>

            {/* Checkboxes */}
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => onChange("geoConsent", !form.geoConsent)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.checkBox,
                  form.geoConsent && styles.checkOn,
                ]}
              />
              <Text style={styles.checkText}>
                Allow geo-location (regional compliance)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkRow, { marginTop: RFValue(10) }]}
              onPress={() =>
                onChange("termsAccepted", !form.termsAccepted)
              }
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.checkBox,
                  form.termsAccepted && styles.checkOn,
                ]}
              />
              <Text style={styles.checkText}>
                I accept Terms &amp; Privacy Policy
              </Text>
            </TouchableOpacity>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.cta}
            onPress={handleSignUp}
            disabled={busy}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>
              {busy ? "Creating..." : "Create account ->"}
            </Text>
          </TouchableOpacity>

          {/* Footer */}
          <TouchableOpacity
            onPress={() => router.push("/user/login")}
            style={{ marginTop: RFValue(12) }}
          >
            <Text style={styles.footerLink}>
              Already have an account? Log in
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* DOB Picker */}
        {showDobPicker && (
          <DateTimePicker
            value={dobDate || new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={maxDob}
            onChange={onChangeDob}
          />
        )}

        {/* Country Picker Modal */}
        <Modal
          visible={showCountryPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowCountryPicker(false)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <ScrollView
                style={{ maxHeight: RFValue(260), marginTop: 6 }}
                showsVerticalScrollIndicator={false}
              >
                {COUNTRIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={styles.countryRow}
                    onPress={() => {
                      onChange("country", c.code);
                      // If not US, clear state so US states don't stick around
                      if (c.code !== "US") {
                        onChange("state", "");
                        setShowStatePicker(false);
                      }
                      setShowCountryPicker(false);
                    }}
                  >
                    <Text style={styles.countryCode}>{c.code}</Text>
                    <Text style={styles.countryName}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* State Picker Modal */}
        <Modal
          visible={showStatePicker && isUS}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStatePicker(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowStatePicker(false)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Select State</Text>
              <ScrollView
                style={{ maxHeight: RFValue(260), marginTop: 6 }}
                showsVerticalScrollIndicator={false}
              >
                {US_STATES.map((s) => (
                  <TouchableOpacity
                    key={s.code}
                    style={styles.stateRow}
                    onPress={() => {
                      onChange("state", s.code);
                      setShowStatePicker(false);
                    }}
                  >
                    <Text style={styles.stateCode}>{s.code}</Text>
                    <Text style={styles.stateName}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

/** ---- Underlined input wrapper ---- */

function Underlined(props: any) {
  return (
    <View style={{ marginBottom: RFValue(18) }}>
      <TextInput
        {...props}
        placeholderTextColor="rgba(255,255,255,0.8)"
        style={styles.inputLine}
      />
    </View>
  );
}

/** ---- Styles ---- */

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000" },

  back_btn: {
    width: RFValue(98),
    height: RFValue(40),
  },
  back_img: { width: "100%", height: "100%" },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: RFValue(16),
    paddingBottom: RFValue(36),
    alignItems: "center",
  },
  topRow: {
    width: "100%",
    alignItems: "flex-start",
    marginTop: RFValue(24),
    marginBottom: RFValue(4),
  },

  headerBlock: {
    width: "100%",
    marginTop: RFValue(12),
    marginBottom: RFValue(14),
  },
  bigTitle: {
    color: "#fff",
    fontSize: RFValue(32),
    fontWeight: "900",
    lineHeight: RFValue(34),
  },
  subTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: RFValue(12),
    marginTop: RFValue(6),
  },

  inputLine: {
    color: "#fff",
    fontSize: RFValue(12),
    paddingVertical: RFValue(8),
    paddingLeft: 0,
    paddingRight: 0,
    borderBottomWidth: 1.2,
    borderBottomColor: "rgba(255,255,255,0.7)",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: RFValue(10),
  },

  meterWrapper: {
    marginTop: RFValue(6),
    marginBottom: RFValue(8),
  },
  meterTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  meterFill: { height: 6, backgroundColor: GOLD },
  meterText: {
    color: "#fff",
    opacity: 0.85,
    fontSize: RFValue(10),
    marginTop: 4,
  },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: RFValue(14),
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.7)",
    marginRight: 10,
  },
  checkOn: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  checkText: {
    color: "#fff",
    opacity: 0.9,
    fontSize: RFValue(11),
    flex: 1,
  },

  cta: {
    marginTop: RFValue(26),
    backgroundColor: "#fff",
    borderRadius: RFValue(18),
    paddingVertical: RFValue(13),
    paddingHorizontal: RFValue(18),
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: {
    color: "#000",
    fontWeight: "700",
    fontSize: RFValue(13),
  },
  footerLink: {
    color: GOLD,
    fontSize: RFValue(12),
    textAlign: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: RFValue(18),
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(15,10,25,0.98)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  modalTitle: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "700",
  },

  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(6),
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  stateCode: {
    width: 40,
    color: GOLD,
    fontSize: RFValue(12),
    fontWeight: "700",
  },
  stateName: {
    color: "#fff",
    fontSize: RFValue(12),
  },

  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: RFValue(6),
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  countryCode: {
    width: 40,
    color: GOLD,
    fontSize: RFValue(12),
    fontWeight: "700",
  },
  countryName: {
    color: "#fff",
    fontSize: RFValue(12),
  },
});
