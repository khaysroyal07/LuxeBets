import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Platform,
  Alert
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.15)";
const CARD_BG = "rgba(255,255,255,0.10)";

const BG = require("@/assets/images/bgDash.png"); // starry background

const Settings: React.FC = () => {
  const router = useRouter();
    const { user, signOut } = useAuth();
  
  // NEW: sign out + go to login
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/user/login");
    } catch (e: any) {
      Alert.alert("Sign out failed", e.message ?? "Please try again.");
    }
  };
  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.bg}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={RFValue(18)} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: RFValue(32) }} />
      </View>

      <View style={styles.content}>
        {/* Account */}
        <SettingsCard label="Account">
          <SettingsItem
            icon="person-circle-outline"
            text="Edit profile"
            onPress={() => router.push("/profile/edit")}
          />
          <SettingsItem
            icon="shield-checkmark-outline"
            text="Security"
            onPress={() => router.push("/user/security")}
          />
          <SettingsItem
            icon="notifications-outline"
            text="Notifications"
            onPress={() => router.push("/user/notifications")}
          />
          <SettingsItem
            icon="lock-closed-outline"
            text="Privacy"
            onPress={() => router.push("/user/privacy")}
            isLast
          />
        </SettingsCard>

        {/* Support */}
        <SettingsCard label="Support">
          <SettingsItem
            icon="card-outline"
            text="My Subscription"
            onPress={() => router.push("/user/subscription")}
          />
          <SettingsItem
            icon="help-circle-outline"
            text="Help & Support"
            onPress={() => router.push("/user/help")}
          />
          <SettingsItem
            icon="document-text-outline"
            text="Terms and Policies"
            onPress={() => router.push("/user/terms")}
            isLast
          />
        </SettingsCard>

        {/* Actions */}
        <SettingsCard label="Actions">
          <SettingsItem
            icon="bug-outline"
            text="Report a problem"
            onPress={() => router.push("/user/report")}
          />
          <SettingsItem
            icon="person-add-outline"
            text="Add account"
            onPress={() => router.push("/user/add-account")}
          />
          <SettingsItem
            icon="log-out-outline"
            text="Log out"
            onPress={handleSignOut}
          />
        </SettingsCard>
      </View>
    </ImageBackground>
  );
};

export default Settings;

/* ---------- Subcomponents ---------- */

type CardProps = { label: string; children: React.ReactNode };
const SettingsCard: React.FC<CardProps> = ({ label, children }) => (
  <View style={styles.card}>
    <Text style={styles.cardLabel}>{label}</Text>
    <View style={styles.cardBody}>{children}</View>
  </View>
);

type ItemProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  onPress: () => void;
  isLast?: boolean;
};
const SettingsItem: React.FC<ItemProps> = ({ icon, text, onPress, isLast }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={[styles.item, isLast && { borderBottomWidth: 0 }]}
  >
    <View style={styles.itemLeft}>
      <Ionicons name={icon} size={RFValue(18)} color="#fff" style={{ marginRight: RFValue(10) }} />
      <Text style={styles.itemText}>{text}</Text>
    </View>
    <Ionicons name="chevron-forward" size={RFValue(16)} color="rgba(255,255,255,0.7)" />
  </TouchableOpacity>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0d0013" },

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
  itemLeft: { flexDirection: "row", alignItems: "center" },
  itemText: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "600",
  },
});

