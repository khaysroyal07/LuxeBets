// app/admin/withdrawals.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ImageBackground,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/AuthContext";
import { useRouter } from "expo-router";

const BG = require("@/assets/images/bgDash.png");
const GOLD = "#FFD700";
const INK = "#0E0A12";
const CARD = "rgba(10,10,20,0.96)";
const BORDER = "rgba(255,255,255,0.18)";

type WithdrawStatus = "pending" | "approved" | "rejected" | "canceled";

type WithdrawRow = {
  id: number;
  user_id: string;
  amount_cents: number;
  status: WithdrawStatus;
  reason: string | null;
  created_at: string;
  admin_id: string | null;
  processed_at: string | null;
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type LedgerRow = {
  id: string;
  type: "deposit" | "withdraw" | "adjust";
  amount_cents: number;
  status: "pending" | "succeeded" | "failed" | "canceled";
  created_at: string;
};

export default function AdminWithdrawalsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<WithdrawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WithdrawStatus>(
    "all"
  );

  // Reject modal state
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<WithdrawRow | null>(null);

  // Info modal state
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoTarget, setInfoTarget] = useState<WithdrawRow | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoBalance, setInfoBalance] = useState<number | null>(null);
  const [infoLedger, setInfoLedger] = useState<LedgerRow[]>([]);
  const [infoTotals, setInfoTotals] = useState<{
    deposits: number;
    withdraws: number;
    net: number;
  } | null>(null);

  const isAdmin =
    user?.user_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";

  // Hard-guard: only admins should see this screen at all
  useEffect(() => {
    if (!user) {
      router.replace("/user/login");
    } else if (!isAdmin) {
      router.replace("/(tabs)/wallet");
    }
  }, [user, isAdmin, router]);

  /** ---------- LOAD DATA ---------- */

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("withdraw_requests")
        .select(
          `
          id,
          user_id,
          amount_cents,
          status,
          reason,
          created_at,
          admin_id,
          processed_at,
          user:profiles!user_id (
            id,
            full_name,
            email
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as WithdrawRow[]);
    } catch (e: any) {
      console.error("fetchRequests error", e);
      Alert.alert("Error loading", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  /** ---------- FILTER / SEARCH ---------- */

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const name = r.user?.full_name ?? "";
      const email = r.user?.email ?? "";
      return (
        name.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  /** ---------- APPROVE / REJECT ---------- */

  const handleApprove = useCallback(
    async (row: WithdrawRow) => {
      try {
        setProcessingId(row.id);
        const { error } = await supabase.rpc(
          "admin_approve_withdraw_request",
          {
            p_request_id: row.id,
          }
        );
        if (error) throw error;
        await fetchRequests();
      } catch (e: any) {
        console.error("approve error", e);
        Alert.alert("Approve error", e?.message ?? String(e));
      } finally {
        setProcessingId(null);
      }
    },
    [fetchRequests]
  );

  const openRejectModal = (row: WithdrawRow) => {
    setRejectTarget(row);
    setRejectReason("");
    setRejectVisible(true);
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    try {
      setProcessingId(rejectTarget.id);
      const { error } = await supabase.rpc(
        "admin_reject_withdraw_request",
        {
          p_request_id: rejectTarget.id,
          p_reason: rejectReason || null,
        }
      );
      if (error) throw error;
      setRejectVisible(false);
      setRejectTarget(null);
      setRejectReason("");
      await fetchRequests();
    } catch (e: any) {
      console.error("reject error", e);
      Alert.alert("Reject error", e?.message ?? String(e));
    } finally {
      setProcessingId(null);
    }
  };

  /** ---------- INFO MODAL (USER WALLET SNAPSHOT) ---------- */

  const openInfo = useCallback(async (row: WithdrawRow) => {
    setInfoTarget(row);
    setInfoVisible(true);
    setInfoLoading(true);
    try {
      const uid = row.user_id;

      const [{ data: acct }, { data: ledger }] = await Promise.all([
        supabase
          .from("wallet_accounts")
          .select("balance_cents")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("wallet_ledger")
          .select("id, type, amount_cents, status, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      setInfoBalance(acct?.balance_cents ?? 0);
      setInfoLedger((ledger ?? []) as LedgerRow[]);

      let deposits = 0;
      let withdraws = 0;
      for (const row of (ledger ?? []) as LedgerRow[]) {
        if (row.status !== "succeeded") continue;
        if (row.type === "deposit") deposits += row.amount_cents;
        if (row.type === "withdraw") withdraws += row.amount_cents;
      }
      setInfoTotals({
        deposits: deposits / 100,
        withdraws: withdraws / 100,
        net: (deposits - withdraws) / 100,
      });
    } catch (e: any) {
      console.error("info load error", e);
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setInfoLoading(false);
    }
  }, []);

  const closeInfo = () => {
    setInfoVisible(false);
    setInfoTarget(null);
    setInfoLedger([]);
    setInfoTotals(null);
    setInfoBalance(null);
  };

  /** ---------- RENDER ROW ---------- */

  const renderItem = ({ item }: { item: WithdrawRow }) => {
    const dollars = (item.amount_cents / 100).toFixed(2);
    const name =
      item.user?.full_name || item.user?.email || item.user_id;
    const isPending = item.status === "pending";

    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.meta}>
              #{item.id} •{" "}
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.amount}>${dollars}</Text>
            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.status,
                  styles[
                    `status_${item.status}` as
                      | "status_pending"
                      | "status_approved"
                      | "status_rejected"
                      | "status_canceled"
                  ],
                ]}
              >
                {item.status.toUpperCase()}
              </Text>
              <TouchableOpacity
                onPress={() => openInfo(item)}
                style={{ marginLeft: 6 }}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={GOLD}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {item.reason && (
          <Text style={styles.reason}>Reason: {item.reason}</Text>
        )}

        {isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnApprove]}
              onPress={() => handleApprove(item)}
              disabled={processingId === item.id}
              activeOpacity={0.9}
            >
              {processingId === item.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.btnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnReject]}
              onPress={() => openRejectModal(item)}
              disabled={processingId === item.id}
              activeOpacity={0.9}
            >
              <Ionicons
                name="close-circle"
                size={16}
                color="#fff"
              />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <ImageBackground
      source={BG}
      style={styles.bg}
      imageStyle={{ opacity: 0.6 }}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* Simple page header instead of navbar */}
        <View style={styles.pageHeader}>
          <TouchableOpacity
            style={styles.breadcrumb}
            onPress={() => router.push("/admin")}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={16} color={GOLD} />
            <Text style={styles.breadcrumbText}>Admin Home</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 6 }}>
            <Text style={styles.pageTitle}>Withdraw Requests</Text>
            <Text style={styles.pageSubtitle}>
              Review, approve, or reject player cash-outs.
            </Text>
          </View>
        </View>

        {/* Filters + search */}
        <View style={styles.topControls}>
          <View style={styles.filterRow}>
            {[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "approved", label: "Approved" },
              { key: "rejected", label: "Rejected" },
              { key: "canceled", label: "Canceled" },
            ].map((f) => {
              const selected = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                  ]}
                  onPress={() =>
                    setStatusFilter(f.key as typeof statusFilter)
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextSelected,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.searchBox}>
            <Ionicons
              name="search-outline"
              size={18}
              color="rgba(255,255,255,0.7)"
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search by name or email"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator
            color="#fff"
            style={{ marginTop: 20 }}
          />
        ) : filteredRows.length === 0 ? (
          <Text style={styles.empty}>No withdraw requests yet.</Text>
        ) : (
          <FlatList
            data={filteredRows}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}

        {/* Reject Modal */}
        <Modal
          visible={rejectVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRejectVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setRejectVisible(false)}
          >
            <Pressable
              style={styles.modalCard}
              onPress={() => {}}
            >
              <Text style={styles.modalTitle}>
                Reject withdrawal
              </Text>
              <Text style={styles.modalSubtitle}>
                Optional: add a reason for rejecting this request.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Reason (optional)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    styles.modalBtnCancel,
                  ]}
                  onPress={() => setRejectVisible(false)}
                >
                  <Text style={styles.modalBtnCancelText}>
                    Close
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    styles.modalBtnDestructive,
                  ]}
                  onPress={submitReject}
                  disabled={!rejectTarget}
                >
                  <Text style={styles.modalBtnDestructiveText}>
                    Reject
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Info Modal */}
        <Modal
          visible={infoVisible}
          transparent
          animationType="fade"
          onRequestClose={closeInfo}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeInfo}
          >
            <Pressable
              style={styles.modalCardLarge}
              onPress={() => {}}
            >
              <Text style={styles.modalTitle}>
                Player wallet overview
              </Text>
              <Text style={styles.modalSubtitle}>
                {infoTarget?.user?.full_name ??
                  infoTarget?.user?.email ??
                  infoTarget?.user_id}
              </Text>

              {infoLoading ? (
                <ActivityIndicator
                  color="#fff"
                  style={{ marginTop: 16 }}
                />
              ) : (
                <ScrollView
                  style={{ marginTop: 12, maxHeight: 380 }}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      Current balance
                    </Text>
                    <Text style={styles.infoValue}>
                      $
                      {((infoBalance ?? 0) / 100).toFixed(2)}
                    </Text>
                  </View>
                  {infoTotals && (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          Total deposits
                        </Text>
                        <Text style={styles.infoValue}>
                          ${infoTotals.deposits.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          Total withdrawals
                        </Text>
                        <Text style={styles.infoValue}>
                          ${infoTotals.withdraws.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          Net
                        </Text>
                        <Text style={styles.infoValue}>
                          ${infoTotals.net.toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}

                  <Text style={styles.historyTitle}>
                    Recent money history
                  </Text>
                  {infoLedger.length === 0 ? (
                    <Text style={styles.historyEmpty}>
                      No ledger entries yet.
                    </Text>
                  ) : (
                    infoLedger.map((l) => (
                      <View
                        key={l.id}
                        style={styles.historyRow}
                      >
                        <Text style={styles.historyType}>
                          {l.type.toUpperCase()}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {new Date(
                            l.created_at
                          ).toLocaleString()}{" "}
                          • {l.status}
                        </Text>
                        <Text
                          style={[
                            styles.historyAmount,
                            {
                              color:
                                l.amount_cents >= 0
                                  ? "#22c55e"
                                  : "#ef4444",
                            },
                          ]}
                        >
                          {(l.amount_cents / 100).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnCancel,
                ]}
                onPress={closeInfo}
              >
                <Text style={styles.modalBtnCancelText}>
                  Close
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
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

  /** ---- SIMPLE PAGE HEADER ---- */
  pageHeader: {
    marginBottom: 10,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(10,10,20,0.9)",
  },
  breadcrumbText: {
    marginLeft: 4,
    color: GOLD,
    fontFamily: "PoppinsMedium",
    fontSize: 11,
  },
  pageTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "PoppinsBold",
  },
  pageSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Poppins",
    marginTop: 2,
  },

  /** ---- FILTERS / SEARCH ---- */
  topControls: {
    marginBottom: 10,
  },
  empty: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginTop: 30,
    fontFamily: "Poppins",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(10,10,20,0.9)",
    marginRight: 8,
    marginBottom: 6,
  },
  filterChipSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  filterChipText: {
    color: "#fff",
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },
  filterChipTextSelected: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(5,5,15,0.95)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: 13,
  },

  /** ---- CARDS ---- */
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  name: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },
  meta: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Poppins",
    fontSize: 11,
  },
  amount: {
    color: GOLD,
    fontFamily: "PoppinsBold",
    fontSize: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  status: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
  },
  status_pending: { color: "#facc15" },
  status_approved: { color: "#22c55e" },
  status_rejected: { color: "#ef4444" },
  status_canceled: { color: "#9ca3af" },
  reason: {
    marginTop: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Poppins",
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  btnApprove: { backgroundColor: "#22c55e" },
  btnReject: { backgroundColor: "#ef4444", marginRight: 0 },
  btnText: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    marginLeft: 6,
  },

  /** ---- MODALS ---- */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(15,10,25,0.98)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalCardLarge: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%",
    backgroundColor: "rgba(15,10,25,0.98)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalTitle: {
    color: "#fff",
    fontFamily: "PoppinsBold",
    fontSize: 18,
  },
  modalSubtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins",
    fontSize: 13,
  },
  modalInput: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 80,
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: 13,
    backgroundColor: "rgba(5,5,15,0.95)",
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 10,
  },
  modalBtnCancel: {
    backgroundColor: "transparent",
  },
  modalBtnDestructive: {
    backgroundColor: "#ef4444",
  },
  modalBtnCancelText: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "PoppinsMedium",
    fontSize: 13,
  },
  modalBtnDestructiveText: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },

  /** ---- INFO / HISTORY ---- */
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  infoLabel: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins",
    fontSize: 13,
  },
  infoValue: {
    color: GOLD,
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
  historyTitle: {
    marginTop: 12,
    marginBottom: 4,
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },
  historyEmpty: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Poppins",
    fontSize: 12,
  },
  historyRow: {
    marginTop: 6,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  historyType: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
  },
  historyMeta: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Poppins",
    fontSize: 11,
  },
  historyAmount: {
    marginTop: 2,
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
  },
});
