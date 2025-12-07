// app/admin/referrals.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ImageBackground,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/AuthContext";

const BG = require("@/assets/images/bgDash.png");
const GOLD = "#FFD700";
const INK = "#0E0A12";
const CARD = "rgba(10,10,20,0.96)";
const BORDER = "rgba(255,255,255,0.18)";

type ReferralRow = {
  id: number;
  code: string;
  discount_cents: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  applies_to_tournament_id: string | null;
  new_user_only: boolean;          // 🆕
  created_at?: string;
};

type FilterKey = "all" | "active" | "inactive";

export default function AdminReferralsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("5");
  const [maxUses, setMaxUses] = useState("1");
  const [tournamentId, setTournamentId] = useState("");
  const [newUserOnly, setNewUserOnly] = useState(false); // 🆕
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // edit modal
  const [editTarget, setEditTarget] = useState<ReferralRow | null>(null);
  const [editDiscount, setEditDiscount] = useState("");
  const [editMaxUses, setEditMaxUses] = useState("");
  const [editTournamentId, setEditTournamentId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editNewUserOnly, setEditNewUserOnly] = useState(false); // 🆕
  const [editSaving, setEditSaving] = useState(false);

  const isAdmin =
    user?.user_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";

  useEffect(() => {
    if (!user) {
      router.replace("/user/login");
    } else if (!isAdmin) {
      router.replace("/(tabs)/wallet");
    }
  }, [user, isAdmin, router]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      router.replace("/user/login");
    } catch (e: any) {
      Alert.alert("Logout error", e?.message ?? String(e));
    }
  }, [signOut, router]);

  const loadCodes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("referral_codes")
        .select(
          "id, code, discount_cents, max_uses, used_count, is_active, applies_to_tournament_id, new_user_only, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as ReferralRow[]);
    } catch (e: any) {
      console.error("loadCodes error", e);
      Alert.alert("Error", e?.message ?? "Failed to load referral codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleCreate = async () => {
    if (!code.trim()) {
      return Alert.alert("Code required", "Enter a referral code.");
    }
    if (!discount || isNaN(Number(discount))) {
      return Alert.alert(
        "Invalid discount",
        "Enter a numeric discount in dollars."
      );
    }

    try {
      setSaving(true);
      const discount_cents = Math.round(Number(discount) * 100);
      const max_uses = maxUses ? Number(maxUses) : null;

      const payload: any = {
        code: code.trim().toUpperCase(),
        discount_cents,
        max_uses,
        is_active: true,
        new_user_only: newUserOnly, // 🆕
      };
      if (tournamentId.trim()) {
        payload.applies_to_tournament_id = tournamentId.trim();
      }

      const { error } = await supabase.from("referral_codes").insert(payload);
      if (error) throw error;

      setCode("");
      setDiscount("5");
      setMaxUses("1");
      setTournamentId("");
      setNewUserOnly(false); // reset
      await loadCodes();
      Alert.alert("Created", "Referral code created.");
    } catch (e: any) {
      console.error("createReferral error", e);
      Alert.alert("Error", e?.message ?? "Failed to create referral.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row: ReferralRow) => {
    setEditTarget(row);
    setEditDiscount((row.discount_cents / 100).toString());
    setEditMaxUses(row.max_uses ? String(row.max_uses) : "");
    setEditTournamentId(row.applies_to_tournament_id ?? "");
    setEditActive(row.is_active);
    setEditNewUserOnly(row.new_user_only); // 🆕
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editDiscount || isNaN(Number(editDiscount))) {
      return Alert.alert(
        "Invalid discount",
        "Enter a numeric discount in dollars."
      );
    }

    try {
      setEditSaving(true);
      const discount_cents = Math.round(Number(editDiscount) * 100);
      const max_uses =
        editMaxUses.trim().length > 0 ? Number(editMaxUses) : null;

      const payload: any = {
        discount_cents,
        max_uses,
        is_active: editActive,
        applies_to_tournament_id: editTournamentId.trim() || null,
        new_user_only: editNewUserOnly, // 🆕
      };

      const { error } = await supabase
        .from("referral_codes")
        .update(payload)
        .eq("id", editTarget.id);

      if (error) throw error;

      setEditTarget(null);
      await loadCodes();
      Alert.alert("Updated", "Referral updated.");
    } catch (e: any) {
      console.error("editReferral error", e);
      Alert.alert("Error", e?.message ?? "Failed to update referral.");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteReferral = async (row: ReferralRow) => {
    Alert.alert(
      "Delete referral",
      `Delete code ${row.code}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("referral_codes")
                .delete()
                .eq("id", row.id);
              if (error) throw error;
              await loadCodes();
            } catch (e: any) {
              console.error("deleteReferral error", e);
              Alert.alert(
                "Error",
                e?.message ?? "Failed to delete referral."
              );
            }
          },
        },
      ]
    );
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && !r.is_active) return false;
      if (filter === "inactive" && r.is_active) return false;
      if (!q) return true;
      return r.code.toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  const renderItem = ({ item }: { item: ReferralRow }) => {
    const dollars = (item.discount_cents / 100).toFixed(2);
    const usesLabel = item.max_uses
      ? `${item.used_count} / ${item.max_uses}`
      : `${item.used_count} (no limit)`;
    const appliesLabel = item.applies_to_tournament_id
      ? `Applies to: ${item.applies_to_tournament_id.slice(0, 8)}…`
      : "Applies to: Any tournament";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.meta}>Discount: ${dollars} off</Text>
            <Text style={styles.meta}>Uses: {usesLabel}</Text>
            <Text style={styles.meta}>{appliesLabel}</Text>
            {item.new_user_only && (
              <Text style={[styles.meta, { marginTop: 2 }]}>
                🎟 New users only
              </Text>
            )}
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={[
                styles.badge,
                item.is_active ? styles.badgeActive : styles.badgeInactive,
              ]}
            >
              {item.is_active ? "ACTIVE" : "INACTIVE"}
            </Text>

            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => openEdit(item)}
                style={styles.iconBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteReferral(item)}
                style={[styles.iconBtn, { marginLeft: 6 }]}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color="#fca5a5" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground
      source={BG}
      style={styles.bg}
      imageStyle={{ opacity: 0.6 }}
    >
      {/* Header with back + logout */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 8 }}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back-outline" size={20} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin · Referral Codes</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={22} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Create card */}
      <View style={styles.createCard}>
        <Text style={styles.sectionTitle}>Create referral</Text>

        <Text style={styles.label}>Code</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. BETA5"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Discount ($)</Text>
        <TextInput
          style={styles.input}
          placeholder="5"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={discount}
          onChangeText={setDiscount}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Max uses (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="1"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={maxUses}
          onChangeText={setMaxUses}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Tournament ID (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="UUID (leave blank for any tournament)"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={tournamentId}
          onChangeText={setTournamentId}
          autoCapitalize="none"
        />

        {/* New user only toggle */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setNewUserOnly((x) => !x)}
          activeOpacity={0.85}
        >
          <View
            style={[styles.checkBox, newUserOnly && styles.checkOn]}
          />
          <Text style={styles.checkText}>New users only ($5 welcome)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleCreate}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.createBtnText}>Create referral code</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "inactive", label: "Inactive" },
        ].map((f) => {
          const selected = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                selected && styles.filterChipSelected,
              ]}
              onPress={() => setFilter(f.key as FilterKey)}
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

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons
          name="search-outline"
          size={18}
          color="rgba(255,255,255,0.7)"
          style={{ marginRight: 8 }}
        />
        <TextInput
          placeholder="Search by code"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
      ) : filteredRows.length === 0 ? (
        <Text style={styles.empty}>No referral codes created yet.</Text>
      ) : (
        <FlatList
          style={{ marginTop: 10 }}
          data={filteredRows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {/* Edit modal */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditTarget(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              Edit {editTarget?.code}
            </Text>

            <Text style={styles.label}>Discount ($)</Text>
            <TextInput
              style={styles.input}
              value={editDiscount}
              onChangeText={setEditDiscount}
              keyboardType="numeric"
              placeholder="Amount in dollars"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />

            <Text style={styles.label}>Max uses (optional)</Text>
            <TextInput
              style={styles.input}
              value={editMaxUses}
              onChangeText={setEditMaxUses}
              keyboardType="numeric"
              placeholder="Leave empty for no limit"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />

            <Text style={styles.label}>Tournament ID (optional)</Text>
            <TextInput
              style={styles.input}
              value={editTournamentId}
              onChangeText={setEditTournamentId}
              autoCapitalize="none"
              placeholder="UUID or blank for any"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />

            {/* Edit: new user only */}
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setEditNewUserOnly((x) => !x)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.checkBox,
                  editNewUserOnly && styles.checkOn,
                ]}
              />
              <Text style={styles.checkText}>New users only</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setEditActive((x) => !x)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.checkBox,
                  editActive && styles.checkOn,
                ]}
              />
              <Text style={styles.checkText}>Referral is active</Text>
            </TouchableOpacity>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setEditTarget(null)}
              >
                <Text style={styles.modalBtnCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveEdit}
                disabled={editSaving}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {editSaving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 16,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "PoppinsBold",
  },
  createCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
    marginBottom: 6,
  },
  label: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins",
    fontSize: 11,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: 13,
    backgroundColor: "rgba(5,5,15,0.95)",
  },
  createBtn: {
    marginTop: 12,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
  },
  createBtnText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
  empty: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginTop: 24,
    fontFamily: "Poppins",
    fontSize: 12,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  code: {
    color: "#fff",
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },
  meta: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Poppins",
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontFamily: "PoppinsSemiBold",
    fontSize: 10,
    textAlign: "center",
  },
  badgeActive: {
    backgroundColor: "#22c55e",
    color: "#fff",
  },
  badgeInactive: {
    backgroundColor: "#4b5563",
    color: "#e5e7eb",
  },
  cardActions: {
    flexDirection: "row",
    marginTop: 8,
  },
  iconBtn: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(10,10,20,0.9)",
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
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
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
  modalTitle: {
    color: "#fff",
    fontFamily: "PoppinsBold",
    fontSize: 16,
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
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
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  checkText: {
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: 12,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalBtnCancel: {
    backgroundColor: "transparent",
  },
  modalBtnPrimary: {
    backgroundColor: GOLD,
  },
  modalBtnCancelText: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "PoppinsMedium",
    fontSize: 13,
  },
  modalBtnPrimaryText: {
    color: INK,
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
});
