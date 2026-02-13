// app/settings/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Platform,
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";

import { useAuth } from "@/hooks/AuthContext";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.15)";
const CARD_BG = "rgba(255,255,255,0.10)";
const BG = require("@/assets/images/bgDash.png");

type SettingsRow = {
  biometric_enabled: boolean;
  gps_enabled: boolean;
  notif_push: boolean;
  notif_email: boolean;
  notif_sms: boolean;
  promos_opt_in: boolean;
  cache_buster: number;
};

const DEFAULTS: SettingsRow = {
  biometric_enabled: false,
  gps_enabled: true,
  notif_push: true,
  notif_email: false,
  notif_sms: false,
  promos_opt_in: true,
  cache_buster: 0,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsRow>(DEFAULTS);

  const signedIn = !!user?.id;

  const title = useMemo(() => "Settings", []);

  const load = async () => {
    if (!user?.id) {
      setSettings(DEFAULTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "biometric_enabled,gps_enabled,notif_push,notif_email,notif_sms,promos_opt_in,cache_buster"
      )
      .eq("id", user.id)
      .single();

    if (error) {
      console.warn("[settings] load error", error);
      Alert.alert("Settings", error.message);
      setSettings(DEFAULTS);
    } else {
      setSettings({ ...DEFAULTS, ...(data ?? {}) });
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persist = async (patch: Partial<SettingsRow>) => {
    if (!user?.id) return { ok: false, error: "Not signed in" };

    // optimistic
    setSettings((prev) => ({ ...prev, ...patch }));

    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);

    if (error) {
      console.warn("[settings] save error", error);
      await load(); // rollback
      return { ok: false, error: error.message };
    }

    return { ok: true as const, error: null as any };
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/user/login");
    } catch (e: any) {
      Alert.alert("Sign out failed", e?.message ?? "Please try again.");
    }
  };

  // --------- Toggles that actually work ---------

  const toggleBiometrics = async (next: boolean) => {
    if (!signedIn) return Alert.alert("Sign in required", "Please sign in first.");

    setSavingKey("biometric");
    try {
      if (next) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware) {
          Alert.alert("Not supported", "This device does not support biometrics.");
          return;
        }
        if (!enrolled) {
          Alert.alert(
            "No biometrics enrolled",
            "Please set up Face ID / Touch ID (or device biometrics) first."
          );
          return;
        }

        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: "Enable biometric lock",
          cancelLabel: "Cancel",
          fallbackLabel: "Use Passcode",
          disableDeviceFallback: false,
        });

        if (!res.success) return;
      }

      const out = await persist({ biometric_enabled: next });
      if (!out.ok) Alert.alert("Error", out.error);
    } finally {
      setSavingKey(null);
    }
  };

  const toggleGPS = async (next: boolean) => {
    if (!signedIn) return Alert.alert("Sign in required", "Please sign in first.");

    setSavingKey("gps");
    try {
      if (next) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Location is required for geo-compliance. Please allow location access."
          );
          return;
        }
      }
      const out = await persist({ gps_enabled: next });
      if (!out.ok) Alert.alert("Error", out.error);
    } finally {
      setSavingKey(null);
    }
  };

  const toggleNotif = async (
    key: keyof Pick<SettingsRow, "notif_push" | "notif_email" | "notif_sms" | "promos_opt_in">,
    next: boolean
  ) => {
    if (!signedIn) return Alert.alert("Sign in required", "Please sign in first.");

    setSavingKey(key);
    try {
      const out = await persist({ [key]: next } as any);
      if (!out.ok) Alert.alert("Error", out.error);
    } finally {
      setSavingKey(null);
    }
  };

  const clearCache = async () => {
    if (!signedIn) return Alert.alert("Sign in required", "Please sign in first.");

    setSavingKey("cache");
    try {
      const out = await persist({ cache_buster: (settings.cache_buster ?? 0) + 1 });
      if (!out.ok) return Alert.alert("Error", out.error);
      Alert.alert("Done", "Cache cleared. The app will refetch fresh data.");
    } finally {
      setSavingKey(null);
    }
  };

  // --------- UI helpers ---------

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );

  const NavItem = ({
    icon,
    text,
    onPress,
    isLast,
    rightText,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    text: string;
    onPress: () => void;
    isLast?: boolean;
    rightText?: string;
  }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.item, isLast && { borderBottomWidth: 0 }]}
    >
      <View style={styles.itemLeft}>
        <Ionicons
          name={icon}
          size={RFValue(18)}
          color="#fff"
          style={{ marginRight: RFValue(10) }}
        />
        <Text style={styles.itemText}>{text}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: RFValue(8) }}>
        {!!rightText && (
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: RFValue(11) }}>
            {rightText}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={RFValue(16)} color="rgba(255,255,255,0.7)" />
      </View>
    </TouchableOpacity>
  );

  const ToggleItem = ({
    icon,
    text,
    value,
    onValueChange,
    isLast,
    disabled,
    helper,
    saving,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    text: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    isLast?: boolean;
    disabled?: boolean;
    helper?: string;
    saving?: boolean;
  }) => (
    <View style={[styles.toggleRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.itemLeft}>
          <Ionicons
            name={icon}
            size={RFValue(18)}
            color="#fff"
            style={{ marginRight: RFValue(10) }}
          />
          <Text style={styles.itemText}>{text}</Text>
        </View>
        {!!helper && <Text style={styles.helper}>{helper}</Text>}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: RFValue(10) }}>
        {saving ? <ActivityIndicator size="small" color={GOLD} /> : null}
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={!!disabled || saving}
          trackColor={{ false: "rgba(255,255,255,0.18)", true: "rgba(255,215,0,0.35)" }}
          thumbColor={value ? GOLD : "#ddd"}
        />
      </View>
    </View>
  );

  const ActionItem = ({
    icon,
    text,
    onPress,
    isLast,
    danger,
    right,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    text: string;
    onPress: () => void;
    isLast?: boolean;
    danger?: boolean;
    right?: React.ReactNode;
  }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.item, isLast && { borderBottomWidth: 0 }]}
    >
      <View style={styles.itemLeft}>
        <Ionicons
          name={icon}
          size={RFValue(18)}
          color={danger ? "#ff6b6b" : "#fff"}
          style={{ marginRight: RFValue(10) }}
        />
        <Text style={[styles.itemText, danger && { color: "#ff6b6b" }]}>{text}</Text>
      </View>
      {right ?? <Ionicons name="chevron-forward" size={RFValue(16)} color="rgba(255,255,255,0.7)" />}
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: RFValue(32) }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: RFValue(10) }}>
            Loading settings…
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Account (navigation only for now) */}
          <Section label="Account">
            <NavItem
              icon="person-circle-outline"
              text="Edit profile"
              onPress={() => router.push("/profile/edit")}
            />
            <NavItem
              icon="card-outline"
              text="Payment & Wallet"
              onPress={() => router.push("/wallet")}
            />
            <NavItem
              icon="receipt-outline"
              text="Transaction history"
              onPress={() => router.push("/wallet/transactions")}
            />
            <NavItem
              icon="person-add-outline"
              text="Invite friends"
              onPress={() => router.push("/referrals")}
              isLast
            />
          </Section>

          {/* Compliance */}
          <Section label="Compliance">
            <ToggleItem
              icon="location-outline"
              text="Location Services"
              value={settings.gps_enabled}
              onValueChange={toggleGPS}
              helper="Required for geo-restriction compliance."
              saving={savingKey === "gps"}
            />
            <NavItem
              icon="shield-checkmark-outline"
              text="Age Verification & KYC"
              onPress={() => router.push("/user/kyc")}
              rightText="Coming soon"
              isLast
            />
          </Section>

          {/* Preferences */}
          <Section label="Preferences">
            <ToggleItem
              icon="notifications-outline"
              text="Push notifications"
              value={settings.notif_push}
              onValueChange={(v) => toggleNotif("notif_push", v)}
              helper="Game updates and results."
              saving={savingKey === "notif_push"}
            />
            <ToggleItem
              icon="mail-outline"
              text="Email notifications"
              value={settings.notif_email}
              onValueChange={(v) => toggleNotif("notif_email", v)}
              helper="Receipts, account updates."
              saving={savingKey === "notif_email"}
            />
            <ToggleItem
              icon="chatbubble-ellipses-outline"
              text="SMS notifications"
              value={settings.notif_sms}
              onValueChange={(v) => toggleNotif("notif_sms", v)}
              helper="High priority alerts only."
              saving={savingKey === "notif_sms"}
            />
            <ToggleItem
              icon="sparkles-outline"
              text="Promotions & offers"
              value={settings.promos_opt_in}
              onValueChange={(v) => toggleNotif("promos_opt_in", v)}
              helper="Deals, boosts, and announcements."
              saving={savingKey === "promos_opt_in"}
              isLast
            />
          </Section>

          {/* Security */}
          <Section label="Security">
            <ToggleItem
              icon="finger-print-outline"
              text="Biometric lock"
              value={settings.biometric_enabled}
              onValueChange={toggleBiometrics}
              helper="Lock sensitive screens like Wallet & Withdraw."
              saving={savingKey === "biometric"}
              isLast
            />
          </Section>

          {/* App */}
          <Section label="App & Support">
            <ActionItem
              icon="trash-outline"
              text="Clear cache"
              onPress={clearCache}
              right={
                savingKey === "cache" ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <Ionicons name="sparkles" size={RFValue(16)} color={GOLD} />
                )
              }
            />
            <NavItem icon="help-circle-outline" text="Help & Support" onPress={() => router.push("/user/help")} />
            <NavItem
              icon="document-text-outline"
              text="Terms and Policies"
              onPress={() => router.push("/user/terms")}
            />
            <NavItem
              icon="heart-outline"
              text="Responsible play"
              onPress={() => router.push("/user/responsible")}
              isLast
            />
          </Section>

          {/* Actions */}
          <Section label="Actions">
            <ActionItem icon="bug-outline" text="Report a problem" onPress={() => router.push("/user/report")} />
            <ActionItem
              icon="log-out-outline"
              text="Log out"
              onPress={handleSignOut}
              danger
              isLast
            />
          </Section>

          <View style={{ height: RFValue(24) }} />
        </ScrollView>
      )}
    </ImageBackground>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0d0013" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topBar: {
    paddingTop: RFValue(16),
    paddingHorizontal: RFValue(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: RFValue(32),
    height: RFValue(32),
    borderRadius: RFValue(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: {
    color: "#fff",
    fontWeight: "800",
    fontSize: RFValue(18),
    letterSpacing: 0.3,
  },

  content: {
    paddingHorizontal: RFValue(14),
    paddingTop: RFValue(10),
    paddingBottom: RFValue(20),
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: RFValue(16),
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: RFValue(14),
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
    }),
  },
  cardLabel: {
    color: "#fff",
    opacity: 0.85,
    fontSize: RFValue(12),
    fontWeight: "700",
    paddingHorizontal: RFValue(14),
    paddingTop: RFValue(12),
  },
  cardBody: {
    marginTop: RFValue(8),
    paddingHorizontal: RFValue(8),
    paddingBottom: RFValue(8),
  },

  item: {
    minHeight: RFValue(46),
    paddingHorizontal: RFValue(8),
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleRow: {
    minHeight: RFValue(56),
    paddingHorizontal: RFValue(8),
    paddingVertical: RFValue(8),
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: RFValue(10),
  },
  itemLeft: { flexDirection: "row", alignItems: "center" },
  itemText: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "600",
  },
  helper: {
    marginLeft: RFValue(28),
    marginTop: RFValue(4),
    color: "rgba(255,255,255,0.65)",
    fontSize: RFValue(11),
    lineHeight: RFValue(14),
  },
});
