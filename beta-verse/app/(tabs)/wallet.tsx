// app/(tabs)/Wallet.tsx — LuxeBETS themed wallet (no API, ready to wire later)
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ImageBackground,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
  UIManager,
  LayoutAnimation,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** -------- THEME -------- */
const PURPLE = "#613DC1";
const DEEP_PURPLE = "#2C0735";
const MID_PURPLE = "#4A2E99";
const GOLD = "#FFD700";
const INK = "#0E0A12";
const GLASS = "rgba(30,30,30,0.75)";
const BORDER = "rgba(255,255,255,0.10)";

/** -------- MOCK DATA -------- */
type Txn = {
  id: number;
  icon: any;
  title: string;
  date: string; // display string
  amount: string; // "+100.00" / "-20.00"
  type: "deposit" | "bid" | "win";
};

const transactions: Txn[] = [
  {
    id: 1,
    icon: require("@/assets/icons/deposit.png"),
    title: "Deposit",
    date: "June 28, 2025",
    amount: "+1000.00",
    type: "deposit",
  },
  {
    id: 2,
    icon: require("@/assets/icons/target.png"),
    title: "Tournament Bid – $20",
    date: "June 25, 2025",
    amount: "-20.00",
    type: "bid",
  },
  {
    id: 3,
    icon: require("@/assets/icons/trophy.png"),
    title: "Winnings",
    date: "June 20, 2025",
    amount: "+50.00",
    type: "win",
  },
  {
    id: 4,
    icon: require("@/assets/icons/target.png"),
    title: "Tournament Bid – $20",
    date: "June 19, 2025",
    amount: "-20.00",
    type: "bid",
  },
  {
    id: 5,
    icon: require("@/assets/icons/deposit.png"),
    title: "Deposit",
    date: "June 18, 2025",
    amount: "+300.00",
    type: "deposit",
  },
  {
    id: 6,
    icon: require("@/assets/icons/target.png"),
    title: "Tournament Bid – $20",
    date: "June 19, 2025",
    amount: "-20.00",
    type: "bid",
  },
  {
    id: 7,
    icon: require("@/assets/icons/target.png"),
    title: "Tournament Bid – $20",
    date: "June 19, 2025",
    amount: "-20.00",
    type: "bid",
  },
];

/** -------- HELPERS -------- */
function isPositive(amount: string) {
  const n = Number(amount.replace(/[+,]/g, ""));
  return !isNaN(n) && n >= 0;
}
function amtColor(amount: string) {
  return isPositive(amount) ? "#22c55e" : "#ef4444";
}
function chipTextFromType(t?: Txn["type"]) {
  if (t === "deposit") return "Deposit";
  if (t === "bid") return "Bid";
  if (t === "win") return "Winnings";
  return "Other";
}
function formatUsd(n: number) {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function WalletScreen() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });
  const [filter, setFilter] = useState<"ALL" | "deposit" | "bid" | "win">("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [showAction, setShowAction] = useState<null | "deposit" | "withdraw">(null);

  const filtered = useMemo(() => {
    const base = [...transactions];
    const list = filter === "ALL" ? base : base.filter((t) => t.type === filter);
    // simple sort: most recent first by id (mock)
    return list.sort((a, b) => b.id - a.id);
  }, [filter]);

  const totals = useMemo(() => {
    let deposits = 0;
    let wins = 0;
    let spends = 0;
    for (const t of transactions) {
      const v = Number(t.amount.replace(/[+,]/g, ""));
      if (t.type === "deposit") deposits += v;
      else if (t.type === "win") wins += v;
      else if (t.type === "bid") spends += Math.abs(v);
    }
    const balance = 120; // demo balance to match your mock
    return {
      deposits,
      wins,
      spends,
      balance,
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const goSettings = useCallback(() => {
    LayoutAnimation.easeInEaseOut();
    router.push("/user/settings");
  }, [router]);

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/bgDash.png")}
      style={styles.bg}
      imageStyle={{ opacity: 0.55 }}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={{ width: 28 }} />
        <Text style={styles.title}>Wallet</Text>
        <TouchableOpacity onPress={goSettings} activeOpacity={0.85}>
          <Ionicons name="settings-outline" size={24} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.padX}>
        <LinearGradient
          colors={[PURPLE, MID_PURPLE, DEEP_PURPLE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gloss}
          />
          <View style={styles.balanceRowTop}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={14} color={INK} />
              <Text style={styles.badgeText}>Secure</Text>
            </View>
          </View>
          <Text style={styles.balanceAmount}>{formatUsd(totals.balance)}</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => setShowAction("deposit")}
              style={[styles.actionBtn, styles.actionPrimary]}
              activeOpacity={0.9}
            >
              <Ionicons name="card-outline" size={18} color={INK} />
              <Text style={styles.actionPrimaryText}>Add Funds</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowAction("withdraw")}
              style={[styles.actionBtn, styles.actionSecondary]}
              activeOpacity={0.9}
            >
              <Ionicons name="download-outline" size={18} color={GOLD} />
              <Text style={styles.actionSecondaryText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Quick Stats */}
      <View style={[styles.padX, { marginTop: 6 }]}>
        <View style={styles.statsRow}>
          <BlurView intensity={70} tint="dark" style={styles.statCard}>
            <Text style={styles.statLabel}>Deposits</Text>
            <Text style={[styles.statValue, { color: "#22c55e" }]}>
              {formatUsd(totals.deposits)}
            </Text>
          </BlurView>
          <BlurView intensity={70} tint="dark" style={styles.statCard}>
            <Text style={styles.statLabel}>Winnings</Text>
            <Text style={[styles.statValue, { color: GOLD }]}>
              {formatUsd(totals.wins)}
            </Text>
          </BlurView>
          <BlurView intensity={70} tint="dark" style={styles.statCard}>
            <Text style={styles.statLabel}>Spent</Text>
            <Text style={[styles.statValue, { color: "#ef4444" }]}>
              {formatUsd(totals.spends)}
            </Text>
          </BlurView>
        </View>
      </View>

      {/* Filters */}
      <View style={[styles.padX, { marginTop: 12 }]}>
        <View style={styles.filterRow}>
          {["ALL", "deposit", "bid", "win"].map((k) => {
            const selected = filter === (k as any);
            return (
              <TouchableOpacity
                key={k}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setFilter(k as any);
                }}
                activeOpacity={0.85}
                style={[
                  styles.chip,
                  selected && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {k === "ALL" ? "All" : chipTextFromType(k as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Transaction List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.rowPad}>
            <BlurView intensity={60} tint="dark" style={styles.txnCard}>
              <LinearGradient
                colors={["rgba(97,61,193,0.25)", "rgba(44,7,53,0.25)"]}
                style={StyleSheet.absoluteFill}
              />
              <Image source={item.icon} style={styles.icon} />
              <View style={{ flex: 1 }}>
                <View style={styles.txnTitleRow}>
                  <Text numberOfLines={1} style={styles.txnTitle}>
                    {item.title}
                  </Text>
                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{chipTextFromType(item.type)}</Text>
                  </View>
                </View>
                <Text style={styles.txnDate}>{item.date}</Text>
              </View>
              <Text style={[styles.txnAmount, { color: amtColor(item.amount) }]}>
                {isPositive(item.amount) ? `+${Number(item.amount).toFixed(2)}` : `${Number(item.amount).toFixed(2)}`}
              </Text>
            </BlurView>
          </View>
        )}
        ListHeaderComponent={
          <View style={[styles.padX, { marginTop: 16, marginBottom: 4 }]}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No transactions yet.</Text>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Deposit Button */}
      <TouchableOpacity
        onPress={() => setShowAction("deposit")}
        activeOpacity={0.9}
        style={styles.fab}
      >
        <Ionicons name="add" size={24} color={INK} />
      </TouchableOpacity>

      {/* Simple Action Modal (no API) */}
      <Modal
        transparent
        visible={!!showAction}
        onRequestClose={() => setShowAction(null)}
        animationType="fade"
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAction(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {showAction === "deposit" ? "Add Funds" : "Withdraw"}
            </Text>
            <Text style={styles.modalNote}>
              This is a mock flow. Wire to your payment method later.
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                onPress={() => setShowAction(null)}
                style={[styles.actionBtn, styles.actionPrimary, { flex: 1 }]}
                activeOpacity={0.9}
              >
                <Ionicons name="checkmark-circle" size={18} color={INK} />
                <Text style={styles.actionPrimaryText}>Continue</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity
                onPress={() => setShowAction(null)}
                style={[styles.actionBtn, styles.actionSecondary, { flex: 1 }]}
                activeOpacity={0.9}
              >
                <Ionicons name="close-circle" size={18} color={GOLD} />
                <Text style={styles.actionSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ImageBackground>
  );
}

/** -------- STYLES -------- */
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: INK },

  topBar: {
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    fontSize: 22,
    color: "#fff",
    fontFamily: "PoppinsBold",
    letterSpacing: 0.3,
  },

  padX: { paddingHorizontal: 18 },
  rowPad: { paddingHorizontal: 18, marginBottom: 10 },

  balanceCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  gloss: {
    position: "absolute",
    left: 0,
    right: -40,
    top: 0,
    height: 80,
    transform: [{ skewX: "-12deg" }],
    opacity: 0.5,
  },
  balanceRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    color: "white",
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    opacity: 0.9,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: GOLD,
    borderRadius: 999,
  },
  badgeText: { color: INK, fontFamily: "PoppinsSemiBold", fontSize: 12 },

  balanceAmount: {
    fontSize: 34,
    color: "white",
    fontFamily: "PoppinsBold",
    marginVertical: 10,
  },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  actionPrimary: {
    backgroundColor: GOLD,
    borderColor: "transparent",
    flex: 1,
  },
  actionPrimaryText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },
  actionSecondary: {
    backgroundColor: "transparent",
    borderColor: GOLD,
    flex: 1,
  },
  actionSecondaryText: {
    color: GOLD,
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statLabel: {
    fontFamily: "Poppins",
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  statValue: {
    fontFamily: "PoppinsSemiBold",
    color: "#fff",
    fontSize: 16,
    marginTop: 4,
  },

  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(44,7,53,0.8)",
  },
  chipSelected: { backgroundColor: PURPLE, borderColor: GOLD },
  chipText: { color: "#fff", fontFamily: "PoppinsMedium", fontSize: 13 },
  chipTextSelected: { color: GOLD, fontFamily: "PoppinsSemiBold" },

  sectionTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#fff",
    opacity: 0.95,
  },

  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: BORDER,
  },
  icon: { width: 40, height: 40, marginRight: 12, borderRadius: 10 },

  txnTitleRow: { flexDirection: "row", alignItems: "center" },
  txnTitle: {
    fontSize: 14,
    color: "#fff",
    fontFamily: "PoppinsMedium",
    flexShrink: 1,
    maxWidth: "75%",
  },
  typePill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,215,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.3)",
  },
  typePillText: { color: GOLD, fontSize: 10, fontFamily: "PoppinsSemiBold" },

  txnDate: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Poppins",
    marginTop: 2,
  },
  txnAmount: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    marginLeft: 10,
    minWidth: 80,
    textAlign: "right",
  },

  emptyText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Poppins",
    textAlign: "center",
    marginTop: 20,
  },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 26,
    backgroundColor: GOLD,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(25,25,25,0.95)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { color: "#fff", fontFamily: "PoppinsBold", fontSize: 18 },
  modalNote: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins",
    marginTop: 6,
    marginBottom: 12,
  },
  modalRow: { flexDirection: "row", marginTop: 4 },
});
