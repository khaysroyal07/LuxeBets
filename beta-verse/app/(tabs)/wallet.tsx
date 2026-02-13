// app/(tabs)/wallet.tsx — LuxeBETS Wallet (Galaxy v2)
// FULL CODE ✅
// - Entire screen scrolls (FlatList is the only scroller)
// - Floating "Top" button appears after scrolling down
// - "Top" button is RESPONSIVE + always floats ABOVE the tab bar (iOS/Android)
// - Uses safe-area insets so it never sits under iPhone home indicator
// - Adds extra bottom padding so the last transactions aren’t hidden by the floating tab bar
// - ✅ BIO LOCK: FaceID/TouchID required when opening Wallet tab

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  ActivityIndicator,
  Alert,
  TextInput,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** -------- THEME -------- */
const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const INK = "#05010A";
const GLASS = "rgba(7,7,20,0.95)";
const BORDER = "rgba(255,255,255,0.12)";
const BAD_RED = "#f97373";
const GOOD_GREEN = "#22c55e";
const AMBER = "#fbbf24";

const BG = require("@/assets/images/bgDash.png");

/**
 * Your Tabs _layout.tsx uses:
 * height: 90
 * marginBottom: 40
 * position: "absolute"
 * width: "90%"
 *
 * We'll mirror that here so the FAB always sits ABOVE it.
 */
const TAB_BAR_HEIGHT = 90;
const TAB_BAR_MARGIN_BOTTOM = 40;

/** -------- TYPES -------- */
type TxnType = "deposit" | "bid" | "win" | "withdraw";

type Txn = {
  id: string | number;
  icon: any;
  title: string;
  date: string; // display string
  amount: string; // base amount (no sign)
  type: TxnType;
  signedCents: number; // + = green, - = red, 0 = neutral
  pending?: boolean;
  requestStatus?: "pending" | "approved" | "rejected" | "paid" | "canceled";
  referralCode?: string;
  referralDiscountCents?: number;
};

type LedgerRow = {
  id: string;
  user_id: string;
  type: "deposit" | "withdraw" | "adjust";
  amount_cents: number;
  status: "pending" | "succeeded" | "failed" | "canceled";
  ext_ref: string | null;
  created_at: string;
  referral_code?: string | null;
  referral_discount_cents?: number | null;
};

type WithdrawRequestRow = {
  id: number;
  user_id: string;
  amount_cents: number;
  status: "pending" | "approved" | "rejected" | "paid" | "canceled";
  created_at: string;
};

/** -------- HELPERS -------- */
function chipTextFromType(t?: TxnType) {
  if (t === "deposit") return "Deposit";
  if (t === "bid") return "Bid";
  if (t === "win") return "Winnings";
  if (t === "withdraw") return "Withdraw";
  return "Other";
}

function formatUsd(n: number) {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function pillColors(t: Txn) {
  if (t.pending) {
    return {
      bg: "rgba(234,179,8,0.18)",
      border: "rgba(234,179,8,0.6)",
      text: "#fde68a",
    };
  }

  switch (t.type) {
    case "deposit":
      return { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.65)", text: "#bbf7d0" };
    case "bid":
      return { bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.7)", text: "#fed7aa" };
    case "win":
      return { bg: "rgba(129,140,248,0.2)", border: "rgba(196,181,253,0.7)", text: "#e9d5ff" };
    case "withdraw":
    default:
      return { bg: "rgba(248,113,113,0.2)", border: "rgba(248,113,113,0.7)", text: "#fecaca" };
  }
}

function mapLedgerToTxn(row: LedgerRow): Txn | null {
  if (row.status !== "succeeded") return null;

  if (row.type === "deposit") {
    return {
      id: row.id,
      icon: require("@/assets/icons/deposit.png"),
      title: "Deposit",
      date: new Date(row.created_at).toLocaleString(),
      amount: (row.amount_cents / 100).toFixed(2),
      type: "deposit",
      signedCents: row.amount_cents,
    };
  }

  if (row.type === "adjust") {
    const isWin = row.amount_cents >= 0;

    if (isWin) {
      return {
        id: row.id,
        icon: require("@/assets/icons/trophy.png"),
        title: "Winnings",
        date: new Date(row.created_at).toLocaleString(),
        amount: (Math.abs(row.amount_cents) / 100).toFixed(2),
        type: "win",
        signedCents: row.amount_cents,
      };
    }

    return {
      id: row.id,
      icon: require("@/assets/icons/target.png"),
      title: "Tournament Entry",
      date: new Date(row.created_at).toLocaleString(),
      amount: (Math.abs(row.amount_cents) / 100).toFixed(2),
      type: "bid",
      signedCents: row.amount_cents,
      referralCode: row.referral_code ?? undefined,
      referralDiscountCents: row.referral_discount_cents ?? undefined,
    };
  }

  if (row.type === "withdraw") {
    return {
      id: row.id,
      icon: require("@/assets/icons/target.png"),
      title: "Withdrawal",
      date: new Date(row.created_at).toLocaleString(),
      amount: (row.amount_cents / 100).toFixed(2),
      type: "withdraw",
      signedCents: -row.amount_cents,
    };
  }

  return null;
}

function mapWithdrawReqToTxn(row: WithdrawRequestRow): Txn {
  const isPending = row.status === "pending";
  const isCanceled = row.status === "rejected" || row.status === "canceled";

  return {
    id: row.id,
    icon: require("@/assets/icons/target.png"),
    title: isPending ? "Withdrawal (pending)" : isCanceled ? "Withdrawal (canceled)" : "Withdrawal",
    date: new Date(row.created_at).toLocaleString(),
    amount: (row.amount_cents / 100).toFixed(2),
    type: "withdraw",
    signedCents: 0,
    pending: isPending,
    requestStatus: row.status,
  };
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = Dimensions.get("window");

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  const [filter, setFilter] = useState<"ALL" | "deposit" | "bid" | "win" | "withdraw">("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [showAction, setShowAction] = useState<null | "deposit" | "withdraw">(null);

  const [loading, setLoading] = useState(true);
  const [balanceCents, setBalanceCents] = useState<number>(0);
  const [rows, setRows] = useState<Txn[]>([]);

  const [depositAmount, setDepositAmount] = useState("20.00");
  const [withdrawAmount, setWithdrawAmount] = useState("10.00");
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // ✅ main scroller ref + floating Top button
  const listRef = useRef<FlatList<Txn>>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ✅ BIO LOCK state
  const [bioReady, setBioReady] = useState(false);
  const [bioSupported, setBioSupported] = useState<boolean>(false);
  const [bioUnlocked, setBioUnlocked] = useState<boolean>(false);
  const [bioChecking, setBioChecking] = useState<boolean>(true);

  // ✅ Responsive thresholds & positioning
  const showAfterY = Math.max(260, Math.floor(screenH * 0.45)); // show after ~half-ish on any device
  const fabBottom = useMemo(() => {
    const safe = Math.max(insets.bottom, 8);
    return safe + TAB_BAR_MARGIN_BOTTOM + TAB_BAR_HEIGHT + 14;
  }, [insets.bottom]);

  // ✅ Ensure list bottom has room for floating tab bar + FAB
  const listBottomPad = useMemo(() => {
    const safe = Math.max(insets.bottom, 8);
    return safe + TAB_BAR_MARGIN_BOTTOM + TAB_BAR_HEIGHT + 120;
  }, [insets.bottom]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  /** ---------------- BIO LOCK ---------------- */
  const checkBioSupport = useCallback(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = !!hasHardware && !!enrolled;
      setBioSupported(supported);
      setBioReady(true);

      // If not supported, don't block the user.
      if (!supported) setBioUnlocked(true);
    } catch {
      setBioSupported(false);
      setBioReady(true);
      setBioUnlocked(true);
    }
  }, []);

  const promptBioUnlock = useCallback(async () => {
    if (!bioReady) return;

    // If device can't do biometrics, allow access.
    if (!bioSupported) {
      setBioUnlocked(true);
      setBioChecking(false);
      return;
    }

    try {
      setBioChecking(true);

      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Wallet",
        fallbackLabel: "Use Passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (res.success) {
        LayoutAnimation.easeInEaseOut();
        setBioUnlocked(true);
      } else {
        setBioUnlocked(false);
      }
    } catch {
      setBioUnlocked(false);
    } finally {
      setBioChecking(false);
    }
  }, [bioReady, bioSupported]);

  // First-time support check
  useEffect(() => {
    checkBioSupport();
  }, [checkBioSupport]);

  // Every time Wallet tab is focused, lock again and require auth
  useFocusEffect(
    useCallback(() => {
      // lock it whenever you come back in
      setBioUnlocked(false);
      setBioChecking(true);

      // slight microtask so the overlay renders before prompt on some Androids
      Promise.resolve().then(() => promptBioUnlock());

      return () => {
        // optional: when leaving wallet, lock it back
        setBioUnlocked(false);
      };
    }, [promptBioUnlock])
  );

  /** ---------------- DATA ---------------- */
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      await supabase.rpc("ensure_wallet_for_user", { p_user_id: uid });

      const [{ data: acct }, { data: ledger }, { data: withdraws }] = await Promise.all([
        supabase.from("wallet_accounts").select("balance_cents").eq("user_id", uid).maybeSingle(),
        supabase.from("wallet_ledger").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
        supabase
          .from("withdraw_requests")
          .select("id, amount_cents, status, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setBalanceCents(acct?.balance_cents ?? 0);

      const ledgerMapped = (ledger ?? []).map(mapLedgerToTxn).filter(Boolean) as Txn[];
      const withdrawMapped = (withdraws ?? []).map(mapWithdrawReqToTxn).filter(Boolean) as Txn[];

      const combined = [...ledgerMapped, ...withdrawMapped].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setRows(combined);
    } catch (e: any) {
      console.warn("wallet fetch error:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch once unlocked (prevents “flash” of wallet content)
    if (!bioUnlocked) return;

    fetchAll();

    const ch1 = supabase
      .channel("wallet_accounts_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_accounts" }, (payload) => {
        const row: any = payload.new;
        if (row?.balance_cents != null) setBalanceCents(row.balance_cents);
      })
      .subscribe();

    const ch2 = supabase
      .channel("wallet_ledger_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_ledger" }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [fetchAll, bioUnlocked]);

  const filtered = useMemo(() => {
    const base = [...rows];
    return filter === "ALL" ? base : base.filter((t) => t.type === filter);
  }, [filter, rows]);

  // ✅ Totals: no separate Bids stat (Spent covers bids + withdraw)
  const totals = useMemo(() => {
    let deposits = 0;
    let wins = 0;
    let spends = 0;

    for (const t of rows) {
      if (t.pending) continue;
      if (t.signedCents === 0) continue;

      const v = t.signedCents / 100;
      if (t.type === "deposit") deposits += v;
      else if (t.type === "win") wins += v;
      else if (t.type === "bid") spends += Math.abs(v);
      else if (t.type === "withdraw") spends += Math.abs(v);
    }

    return {
      deposits,
      wins,
      spends,
      balance: balanceCents / 100,
    };
  }, [rows, balanceCents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const goSettings = useCallback(() => {
    LayoutAnimation.easeInEaseOut();
    router.push("/user/settings");
  }, [router]);

  /** ---------- Deposit + Withdraw handlers ---------- */
  const handleStartDeposit = useCallback(async () => {
    if (depositLoading) return;

    const dollars = parseFloat(depositAmount || "0");
    if (!isFinite(dollars) || dollars < 1) {
      Alert.alert("Enter at least $1.00");
      return;
    }

    try {
      setDepositLoading(true);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.log("getUser error:", authErr);

      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert("Sign in required", "Please sign in to deposit.");
        return;
      }

      const cents = Math.round(dollars * 100);
      const { data, error } = await supabase.functions.invoke("wallet_deposit_create", {
        body: { userId: uid, amount_cents: cents },
      });

      if (error) {
        console.log("invoke error:", error);
        Alert.alert("Edge function failed", JSON.stringify(error, null, 2).slice(0, 800));
        return;
      }

      if (!data?.checkoutUrl) {
        Alert.alert("No checkout URL", JSON.stringify(data, null, 2));
        return;
      }

      await WebBrowser.openBrowserAsync(data.checkoutUrl);
      setShowAction(null);
    } catch (e: any) {
      console.log("Deposit error:", e);
      Alert.alert("Deposit error", e?.message ?? String(e));
    } finally {
      setDepositLoading(false);
    }
  }, [depositAmount, depositLoading]);

  const handleSubmitWithdraw = useCallback(async () => {
    if (withdrawLoading) return;

    const dollars = parseFloat(withdrawAmount || "0");
    if (!isFinite(dollars) || dollars <= 0) {
      Alert.alert("Enter a valid amount");
      return;
    }

    const cents = Math.round(dollars * 100);

    try {
      setWithdrawLoading(true);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        Alert.alert("Auth error", authErr.message);
        return;
      }
      if (!auth.user) {
        Alert.alert("Sign in required", "Please sign in first.");
        return;
      }

      const { error } = await supabase.rpc("request_withdrawal", { p_amount_cents: cents });

      if (error) {
        console.log("withdraw rpc error:", error);
        Alert.alert("Error", error.message);
        return;
      }

      Alert.alert("Request submitted", "We’ll process your withdrawal soon.");
      setShowAction(null);
      fetchAll();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setWithdrawLoading(false);
    }
  }, [withdrawAmount, withdrawLoading, fetchAll]);

  const handleCancelWithdrawal = useCallback(
    async (requestId: number | string) => {
      try {
        const { error } = await supabase.rpc("cancel_withdrawal", { p_request_id: Number(requestId) });

        if (error) {
          console.log("cancel_withdrawal error:", error);
          Alert.alert("Error", error.message);
          return;
        }

        await fetchAll();
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? String(e));
      }
    },
    [fetchAll]
  );

  if (!fontsLoaded) return null;

  // ✅ Hard block: don’t show wallet content until unlocked
  const showLockedOverlay = bioReady && !bioUnlocked;

  return (
    <ImageBackground source={BG} style={styles.bg} imageStyle={{ opacity: 0.7 }}>
      {/* ✅ Wallet UI (only when unlocked) */}
      {bioUnlocked ? (
        <>
          <FlatList
            ref={listRef}
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y;
              setShowScrollTop(y > showAfterY);
            }}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <>
                {/* Top Bar */}
                <View style={[styles.topBar, { paddingTop: Math.max(18, insets.top + 10) }]}>
                  <View style={{ width: 28 }} />
                  <Text style={styles.title}>Wallet</Text>
                  <TouchableOpacity onPress={goSettings} activeOpacity={0.85}>
                    <Ionicons name="settings-outline" size={24} color={GOLD} />
                  </TouchableOpacity>
                </View>

                {/* Balance Card */}
                <View style={styles.padX}>
                  <LinearGradient
                    colors={["#7C3AED", "#4F46E5", "#1D1033"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.balanceCard}
                  >
                    <LinearGradient
                      colors={["rgba(255,255,255,0.25)", "transparent"]}
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

                    {loading ? (
                      <ActivityIndicator color="#fff" style={{ marginVertical: 10 }} />
                    ) : (
                      <Text style={styles.balanceAmount}>{formatUsd(totals.balance)}</Text>
                    )}

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

                {/* Quick Stats (glass) — NO Bids */}
                <View style={[styles.padX, { marginTop: 10 }]}>
                  <View style={styles.statsRow}>
                    <BlurView intensity={80} tint="dark" style={styles.statCard}>
                      <Text style={styles.statLabel}>Deposits</Text>
                      <Text style={[styles.statValue, { color: GOOD_GREEN }]}>{formatUsd(totals.deposits)}</Text>
                    </BlurView>

                    <BlurView intensity={80} tint="dark" style={styles.statCard}>
                      <Text style={styles.statLabel}>Winnings</Text>
                      <Text style={[styles.statValue, { color: GOLD }]}>{formatUsd(totals.wins)}</Text>
                    </BlurView>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <BlurView intensity={80} tint="dark" style={styles.statCardFull}>
                      <Text style={styles.statLabel}>Spent</Text>
                      <Text style={[styles.statValue, { color: BAD_RED }]}>{formatUsd(totals.spends)}</Text>
                    </BlurView>
                  </View>
                </View>

                {/* Filters */}
                <View style={[styles.padX, { marginTop: 14 }]}>
                  <View style={styles.filterRow}>
                    {["ALL", "deposit", "bid", "win", "withdraw"].map((k) => {
                      const selected = filter === (k as any);
                      return (
                        <TouchableOpacity
                          key={k}
                          onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setFilter(k as any);
                          }}
                          activeOpacity={0.9}
                          style={[styles.chip, selected && styles.chipSelected]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                            {k === "ALL" ? "All" : chipTextFromType(k as TxnType)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Section title */}
                <View style={[styles.padX, { marginTop: 18, marginBottom: 6 }]}>
                  <Text style={styles.sectionTitle}>Transaction History</Text>
                </View>
              </>
            }
            renderItem={({ item }) => {
              const pill = pillColors(item);

              let pillText = chipTextFromType(item.type);
              if (item.pending) pillText = "Pending";
              else if (item.requestStatus === "rejected" || item.requestStatus === "canceled") pillText = "Canceled";

              let displayAmount = item.amount;
              let color = "#e5e7eb";

              if (item.pending) {
                displayAmount = Number(item.amount).toFixed(2);
                color = AMBER;
              } else if (item.signedCents < 0) {
                displayAmount = `-${(Math.abs(item.signedCents) / 100).toFixed(2)}`;
                color = item.type === "bid" ? AMBER : BAD_RED;
              } else if (item.signedCents > 0) {
                displayAmount = `+${(Math.abs(item.signedCents) / 100).toFixed(2)}`;
                color = item.type === "win" ? GOLD : GOOD_GREEN;
              } else {
                displayAmount = Number(item.amount || "0").toFixed(2);
              }

              const canCancel = item.type === "withdraw" && item.pending === true;

              return (
                <View style={styles.rowPad}>
                  <TouchableOpacity
                    activeOpacity={canCancel ? 0.75 : 1}
                    onPress={() => {
                      if (!canCancel) return;
                      Alert.alert("Cancel withdrawal?", "This will cancel your pending withdrawal request.", [
                        { text: "No", style: "cancel" },
                        { text: "Yes, cancel", style: "destructive", onPress: () => handleCancelWithdrawal(item.id) },
                      ]);
                    }}
                  >
                    <BlurView intensity={70} tint="dark" style={styles.txnCard}>
                      <LinearGradient
                        colors={["rgba(250,250,255,0.05)", "rgba(88,28,135,0.35)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />

                      <View
                        style={[
                          styles.leftAccent,
                          item.type === "deposit" && { backgroundColor: "rgba(34,197,94,0.9)" },
                          item.type === "bid" && { backgroundColor: "rgba(245,158,11,0.95)" },
                          item.type === "win" && { backgroundColor: "rgba(129,140,248,0.95)" },
                          item.type === "withdraw" && { backgroundColor: "rgba(248,113,113,0.95)" },
                        ]}
                      />

                      <View style={styles.iconWrap}>
                        <Image source={item.icon} style={styles.icon} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={styles.txnTitleRow}>
                          <Text numberOfLines={1} style={styles.txnTitle}>
                            {item.title}
                          </Text>

                          <View style={[styles.typePill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                            <Text style={[styles.typePillText, { color: pill.text }]}>{pillText}</Text>
                          </View>
                        </View>

                        {item.type === "bid" &&
                        item.referralCode &&
                        typeof item.referralDiscountCents === "number" &&
                        item.referralDiscountCents > 0 ? (
                          <Text style={styles.txnReferral}>
                            {`Referral ${item.referralCode} · -$${(item.referralDiscountCents / 100).toFixed(2)}`}
                          </Text>
                        ) : null}

                        <Text style={styles.txnDate}>{item.date}</Text>
                      </View>

                      <Text style={[styles.txnAmount, { color }]}>{displayAmount}</Text>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
              ) : (
                <Text style={styles.emptyText}>No transactions yet.</Text>
              )
            }
            contentContainerStyle={{ paddingBottom: listBottomPad }}
            showsVerticalScrollIndicator={false}
          />

          {/* ✅ Floating "Top" button — RESPONSIVE + ABOVE TAB BAR */}
          {showScrollTop ? (
            <TouchableOpacity onPress={scrollToTop} activeOpacity={0.92} style={[styles.scrollTopFab, { bottom: fabBottom }]}>
              <Ionicons name="arrow-up" size={18} color={INK} />
              <Text style={styles.scrollTopFabText}>Top</Text>
            </TouchableOpacity>
          ) : null}

          {/* Action Modal */}
          <Modal transparent visible={!!showAction} onRequestClose={() => setShowAction(null)} animationType="fade">
            <Pressable style={styles.modalBackdrop} onPress={() => setShowAction(null)}>
              <Pressable onPress={() => {}} style={styles.modalCard}>
                <Text style={styles.modalTitle}>{showAction === "deposit" ? "Add Funds" : "Withdraw"}</Text>
                <Text style={styles.modalNote}>
                  {showAction === "deposit"
                    ? "Enter how much you’d like to add to your LuxeBETS wallet."
                    : "Enter how much you’d like to withdraw from your wallet."}
                </Text>

                <View style={styles.amountRow}>
                  <Text style={styles.amountDollar}>$</Text>
                  <TextInput
                    value={showAction === "deposit" ? depositAmount : withdrawAmount}
                    onChangeText={showAction === "deposit" ? setDepositAmount : setWithdrawAmount}
                    keyboardType="decimal-pad"
                    style={styles.amountInput}
                  />
                </View>

                {showAction === "deposit" ? (
                  <TouchableOpacity
                    onPress={handleStartDeposit}
                    style={[styles.modalPrimaryBtn, depositLoading && { opacity: 0.7 }]}
                    activeOpacity={0.9}
                    disabled={depositLoading}
                  >
                    {depositLoading ? (
                      <ActivityIndicator color={INK} />
                    ) : (
                      <>
                        <Ionicons name="card-outline" size={18} color={INK} />
                        <Text style={styles.modalPrimaryText}>Deposit with Card</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSubmitWithdraw}
                    style={[styles.modalPrimaryBtn, withdrawLoading && { opacity: 0.7 }]}
                    activeOpacity={0.9}
                    disabled={withdrawLoading}
                  >
                    {withdrawLoading ? (
                      <ActivityIndicator color={INK} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={18} color={INK} />
                        <Text style={styles.modalPrimaryText}>Request Withdrawal</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={() => setShowAction(null)} style={styles.modalCancelBtn} activeOpacity={0.85}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}

      {/* ✅ Locked overlay */}
      {showLockedOverlay ? (
        <View style={[styles.lockOverlay, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.lockCardWrap}>
            <BlurView intensity={80} tint="dark" style={styles.lockCard}>
              <LinearGradient
                colors={["rgba(250,250,255,0.08)", "rgba(88,28,135,0.45)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.lockIcon}>
                <Ionicons name="lock-closed" size={24} color={GOLD} />
              </View>

              <Text style={styles.lockTitle}>Wallet Locked</Text>
              <Text style={styles.lockSub}>
                {bioSupported ? "Use Face ID / Touch ID to view your wallet." : "Biometrics unavailable on this device."}
              </Text>

              <TouchableOpacity
                onPress={promptBioUnlock}
                activeOpacity={0.92}
                style={[styles.lockBtn, bioChecking && { opacity: 0.75 }]}
                disabled={bioChecking}
              >
                {bioChecking ? (
                  <ActivityIndicator color={INK} />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={18} color={INK} />
                    <Text style={styles.lockBtnText}>{bioSupported ? "Unlock" : "Continue"}</Text>
                  </>
                )}
              </TouchableOpacity>

              {bioSupported ? (
                <TouchableOpacity
                  onPress={() => router.back()}
                  activeOpacity={0.85}
                  style={{ marginTop: 10, alignSelf: "center" }}
                >
                  <Text style={styles.lockBack}>Go Back</Text>
                </TouchableOpacity>
              ) : null}
            </BlurView>
          </View>
        </View>
      ) : null}
    </ImageBackground>
  );
}

/** -------- STYLES -------- */
const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: INK,
  },

  topBar: {
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
    letterSpacing: 0.4,
  },

  padX: { paddingHorizontal: 18 },
  rowPad: { paddingHorizontal: 18, marginBottom: 10 },

  balanceCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  gloss: {
    position: "absolute",
    left: -20,
    right: 40,
    top: -10,
    height: 90,
    transform: [{ skewX: "-18deg" }],
    opacity: 0.55,
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
  badgeText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
  },

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
    borderRadius: 14,
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
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statCardFull: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statLabel: {
    fontFamily: "Poppins",
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
  },
  statValue: {
    fontFamily: "PoppinsSemiBold",
    color: "#fff",
    fontSize: 15,
    marginTop: 4,
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  chipSelected: {
    backgroundColor: PURPLE,
    borderColor: GOLD,
  },
  chipText: {
    color: "#e5e7eb",
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },
  chipTextSelected: {
    color: GOLD,
    fontFamily: "PoppinsSemiBold",
  },

  sectionTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#fff",
    opacity: 0.96,
  },

  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(6,6,20,0.96)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  leftAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    marginRight: 12,
    overflow: "hidden",
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 30, height: 30 },

  txnTitleRow: { flexDirection: "row", alignItems: "center" },
  txnTitle: {
    fontSize: 14,
    color: "#fff",
    fontFamily: "PoppinsMedium",
    flexShrink: 1,
    maxWidth: "70%",
  },
  typePill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  typePillText: { fontSize: 10, fontFamily: "PoppinsSemiBold" },

  txnReferral: {
    fontSize: 11,
    color: GOLD,
    fontFamily: "PoppinsMedium",
    marginTop: 2,
  },
  txnDate: {
    fontSize: 11,
    color: "rgba(203,213,225,0.85)",
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

  // ✅ Floating Top button (ALWAYS above tabs)
  scrollTopFab: {
    position: "absolute",
    right: 18,

    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,

    zIndex: 9999,
    elevation: 9999,

    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },

    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  scrollTopFabText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    letterSpacing: 0.2,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,4,10,0.75)",
    padding: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(10,6,24,0.98)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: { color: "#fff", fontFamily: "PoppinsBold", fontSize: 18 },
  modalNote: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins",
    marginTop: 6,
    marginBottom: 12,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: "rgba(3,7,18,0.98)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  amountDollar: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 20,
    color: GOLD,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontFamily: "PoppinsBold",
    fontSize: 22,
    color: "#fff",
    paddingVertical: 2,
  },
  modalPrimaryBtn: {
    marginTop: 16,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalPrimaryText: { fontFamily: "PoppinsSemiBold", fontSize: 14, color: INK },
  modalCancelBtn: {
    marginTop: 10,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  modalCancelText: { color: "rgba(255,255,255,0.8)", fontFamily: "PoppinsMedium", fontSize: 13 },

  /** ✅ BIO LOCK STYLES */
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,4,10,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    zIndex: 99999,
    elevation: 99999,
  },
  lockCardWrap: {
    width: "100%",
    maxWidth: 520,
  },
  lockCard: {
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,24,0.96)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  lockIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,215,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
  },
  lockTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
  },
  lockSub: {
    fontFamily: "Poppins",
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    marginTop: 6,
  },
  lockBtn: {
    marginTop: 14,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lockBtnText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },
  lockBack: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
