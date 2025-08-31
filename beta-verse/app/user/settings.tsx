// app/(tabs)/settings.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RFValue } from "react-native-responsive-fontsize";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pushOn, setPushOn] = useState(true);

  const go = (path: string) => router.push(path);

  const handleLogout = async () => {
    try {
      // 🔐 plug in your auth here:
      // Supabase: await supabase.auth.signOut();
      // Amplify:  await signOut();
      router.replace("/user/login");
    } catch (e) {
      console.log("Logout error:", e);
    }
  };

  return (
    <LinearGradient
      colors={["#5a0ba8", "#2b0b74", "#100a3a"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + 8 }]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <Section title="Account">
          <Row
            icon={<Ionicons name="person-circle-outline" size={22} color="#fff" />}
            label="Edit profile"
            onPress={() => go("/user/edit-profile")}
          />
          <Row
            icon={<Ionicons name="shield-checkmark-outline" size={22} color="#fff" />}
            label="Security"
            onPress={() => go("/user/security")}
          />
          <Row
            icon={<Ionicons name="notifications-outline" size={22} color="#fff" />}
            label="Notifications"
            right={
              <Switch
                value={pushOn}
                onValueChange={setPushOn}
                thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                trackColor={{ false: "rgba(255,255,255,0.25)", true: "#7c4dff" }}
              />
            }
          />
          <Row
            isLast
            icon={<Ionicons name="lock-closed-outline" size={22} color="#fff" />}
            label="Privacy"
            onPress={() => go("/legal/privacy")}
          />
        </Section>

        {/* Support */}
        <Section title="Support">
          <Row
            icon={<MaterialCommunityIcons name="crown-outline" size={22} color="#fff" />}
            label="My Subscription"
            onPress={() => go("/billing/subscription")}
          />
          <Row
            icon={<Ionicons name="help-circle-outline" size={22} color="#fff" />}
            label="Help & Support"
            onPress={() => go("/support")}
          />
          <Row
            isLast
            icon={<Ionicons name="document-text-outline" size={22} color="#fff" />}
            label="Terms and Policies"
            onPress={() => go("/legal/terms")}
          />
        </Section>

        {/* Actions */}
        <Section title="Actions">
          <Row
            icon={<Ionicons name="bug-outline" size={22} color="#fff" />}
            label="Report a problem"
            onPress={() => go("/support/report")}
          />
          <Row
            icon={<Ionicons name="person-add-outline" size={22} color="#fff" />}
            label="Add account"
            onPress={() => go("/user/add-account")}
          />
          <Row
            isLast
            icon={<Ionicons name="exit-outline" size={22} color="#ff6b6b" />}
            label="Log out"
            labelStyle={{ color: "#ff6b6b" }}
            right={<Ionicons name="chevron-forward" size={18} color="#ff6b6b" />}
            onPress={handleLogout}
          />
        </Section>
      </ScrollView>
    </LinearGradient>
  );
}

/* ---------- UI Bits ---------- */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <BlurView intensity={50} tint="dark" style={styles.card}>
        {children}
      </BlurView>
    </View>
  );
}

function Row({
  icon,
  label,
  right,
  onPress,
  isLast,
  labelStyle,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
  labelStyle?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(255,255,255,0.08)" }}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.rowLeft}>
        {icon}
        <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {right ?? <Ionicons name="chevron-forward" size={18} color="#fff" />}
      </View>
    </Pressable>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: RFValue(20),
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  sectionWrap: { marginBottom: 18 },
  sectionTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: RFValue(12),
    marginLeft: 6,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },

  row: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowRight: { marginLeft: 10 },
  rowLabel: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "600",
  },
});
