// app/admin/index.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";

const BG = require("@/assets/images/bgDash.png");
const GOLD = "#FFD700";
const INK = "#0E0A12";
const CARD = "rgba(10,10,20,0.96)";
const BORDER = "rgba(255,255,255,0.18)";

export default function AdminHomeScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.email as string | undefined) ||
    "Admin";

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/user/login");
    } catch (e: any) {
      console.error("Logout error", e);
    }
  };

  const goTo = (path: string) => {
    router.push(path as any);
  };

  return (
    <ImageBackground
      source={BG}
      style={styles.bg}
      imageStyle={{ opacity: 0.65 }}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* Top bar / navbar */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>LuxeBETS Admin</Text>
            <Text style={styles.subtitle}>
              Welcome back, {displayName}.
            </Text>
          </View>

          <View style={styles.headerActions}>
       

            <TouchableOpacity onPress={handleLogout} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={22} color={GOLD} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Section label */}
          <Text style={styles.sectionLabel}>Admin Modules</Text>

          {/* Cards grid */}
          <View style={styles.grid}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => goTo("/admin/withdrawals")}
            >
              <View style={styles.cardIconRow}>
                <Ionicons name="cash-outline" size={22} color={GOLD} />
                <Text style={styles.cardTag}>Wallet</Text>
              </View>
              <Text style={styles.cardTitle}>Withdraw Requests</Text>
              <Text style={styles.cardBody}>
                Review and approve player cash-out requests, or reject with a
                reason.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => goTo("/admin/grade_games")}
            >
              <View style={styles.cardIconRow}>
                <Ionicons name="trophy-outline" size={22} color={GOLD} />
                <Text style={styles.cardTag}>Games</Text>
              </View>
              <Text style={styles.cardTitle}>Grade Games</Text>
              <Text style={styles.cardBody}>
                Manually set final scores and grade picks when feeds are missing
                or delayed.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => goTo("/admin/referrals")}
            >
              <View style={styles.cardIconRow}>
                <Ionicons name="gift-outline" size={22} color={GOLD} />
                <Text style={styles.cardTag}>Growth</Text>
              </View>
              <Text style={styles.cardTitle}>Referrals</Text>
              <Text style={styles.cardBody}>
                Monitor invite codes, bonuses, and referral-based rewards.
              </Text>
            </TouchableOpacity>
          </View>

          {/* Small footer / hint */}
          <Text style={styles.footerHint}>
            Need another tool? We can add more admin modules here later
            (KYC, user bans, tournaments debug, etc.).
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: INK,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "PoppinsBold",
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "Poppins",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  appChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "rgba(10,10,20,0.85)",
  },
  appChipText: {
    color: GOLD,
    fontFamily: "PoppinsMedium",
    fontSize: 11,
    marginLeft: 4,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  card: {
    width: "97%", // 1 column for now; you can switch to 48% for 2-column on tablets
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    justifyContent: "space-between",
  },
  cardTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontFamily: "PoppinsMedium",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    marginBottom: 4,
  },
  cardBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontFamily: "Poppins",
  },
  footerHint: {
    marginTop: 10,
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Poppins",
    textAlign: "center",
  },
});
