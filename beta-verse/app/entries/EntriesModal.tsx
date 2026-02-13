// app/entries/EntriesModal.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { Ionicons } from "@expo/vector-icons";
import { supabase, FUNCTIONS_BASE } from "@/lib/supabase";

const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.18)";
const CARD = "rgba(10,10,20,0.98)";

type Props = {
  tournamentId: number | string;
  userId?: string;

  tournamentTitle?: string;
  tournamentSubtitle?: string;
  entryLabel?: string; // "$20 entry"
  weekLabel?: string | null;
  joinLabel?: string | null;

  onClose: () => void;
  onJoined: (entryId: number | string) => void;
};

export default function EntriesModal({
  tournamentId,
  userId,
  tournamentTitle = "Tournament entry",
  tournamentSubtitle,
  entryLabel,
  weekLabel,
  joinLabel,
  onClose,
  onJoined,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [walletDollars, setWalletDollars] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? userId;
        if (!uid) return;

        const { data, error } = await supabase
          .from("wallet_accounts")
          .select("balance_cents")
          .eq("user_id", uid)
          .maybeSingle();

        if (!error && data?.balance_cents != null) {
          setWalletDollars(data.balance_cents / 100);
        }
      } catch {
        // ignore
      }
    })();
  }, [userId]);

  const join = async () => {
    setLoading(true);
    setErr("");
    try {
      const {
        data: { session },
        error: sErr,
      } = await supabase.auth.getSession();

      if (sErr || !session?.access_token) {
        Alert.alert("Sign in required", "Please log in to join tournaments.");
        return;
      }

      const payload: any = { tournament_id: tournamentId };

      const trimmedCode = referralCode.trim().toUpperCase();
      if (trimmedCode.length > 0) payload.referral_code = trimmedCode;

      const r = await fetch(`${FUNCTIONS_BASE}/join_tournament`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 401) throw new Error(j?.message || "Session expired. Please log in again.");
      if (!r.ok || j?.ok === false) throw new Error(j?.message || "Failed to join tournament.");

      const entryId = j?.entry?.id ?? j?.entry_id ?? "";

      const discountCents = j?.discount_cents ?? 0;
      const chargedCents = j?.charged_cents ?? null;
      const baseFeeCents = j?.base_fee_cents ?? null;

      if (trimmedCode && discountCents > 0) {
        const saved = (discountCents / 100).toFixed(2);
        const charged = chargedCents != null ? (chargedCents / 100).toFixed(2) : null;
        const base = baseFeeCents != null ? (baseFeeCents / 100).toFixed(2) : null;

        let msg = `Referral ${trimmedCode} applied.\nYou saved $${saved}.`;
        if (charged && base) msg += `\nEntry: $${base} → Charged: $${charged}`;
        Alert.alert("Referral applied", msg);
      }

      onJoined(entryId);
    } catch (e: any) {
      setErr(e?.message || "Failed to join tournament.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Join Tournament</Text>
      <Text style={styles.subtitle}>
        You’re entering a 6-day tournament (Tue–Sun). Join is open Sun–Tue — you can enter
        multiple tournaments in the same week.
      </Text>

      <View style={styles.summaryBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tTitle}>{tournamentTitle}</Text>
          {!!tournamentSubtitle && <Text style={styles.tSubtitle}>{tournamentSubtitle}</Text>}
          {!!weekLabel && <Text style={styles.tMeta}>{weekLabel}</Text>}
          {!!joinLabel && <Text style={styles.tMetaDim}>{joinLabel}</Text>}
        </View>

        {!!entryLabel && (
          <View style={styles.feePill}>
            <Ionicons name="trophy-outline" size={16} color="#111" style={{ marginRight: 4 }} />
            <Text style={styles.feePillText}>{entryLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.walletRow}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="wallet-outline" size={18} color={GOLD} style={{ marginRight: 6 }} />
          <Text style={styles.walletLabel}>Wallet balance</Text>
        </View>
        <Text style={styles.walletValue}>
          {walletDollars == null ? "—" : `$${walletDollars.toFixed(2)}`}
        </Text>
      </View>

      <View style={styles.inputBlock}>
        <Text style={styles.inputLabel}>Referral code (optional)</Text>
        <TextInput
          value={referralCode}
          onChangeText={setReferralCode}
          placeholder="Enter code"
          placeholderTextColor="rgba(255,255,255,0.5)"
          autoCapitalize="characters"
          style={styles.input}
        />
      </View>

      {!!err && <Text style={styles.err}>{err}</Text>}

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={onClose}
          disabled={loading}
          activeOpacity={0.9}
        >
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={join}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? <ActivityIndicator size="small" color="#111" /> : <Text style={styles.btnPrimaryText}>Join</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: RFValue(20),
    padding: RFValue(16),
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: { color: "#fff", fontFamily: "PoppinsBold", fontSize: RFValue(16) },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Poppins",
    fontSize: RFValue(11),
    marginTop: RFValue(4),
  },
  summaryBox: {
    marginTop: RFValue(14),
    padding: RFValue(10),
    borderRadius: RFValue(14),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(5,5,15,0.95)",
    flexDirection: "row",
    alignItems: "center",
  },
  tTitle: { color: "#fff", fontFamily: "PoppinsSemiBold", fontSize: RFValue(13) },
  tSubtitle: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins", fontSize: RFValue(11), marginTop: 2 },
  tMeta: { color: GOLD, fontFamily: "PoppinsMedium", fontSize: RFValue(10), marginTop: 4 },
  tMetaDim: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins", fontSize: RFValue(9), marginTop: 2 },
  feePill: {
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(6),
    borderRadius: RFValue(999),
    backgroundColor: GOLD,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: RFValue(8),
  },
  feePillText: { color: "#111", fontFamily: "PoppinsSemiBold", fontSize: RFValue(11) },
  walletRow: { marginTop: RFValue(10), flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  walletLabel: { color: "rgba(255,255,255,0.85)", fontFamily: "PoppinsMedium", fontSize: RFValue(11) },
  walletValue: { color: GOLD, fontFamily: "PoppinsSemiBold", fontSize: RFValue(12) },
  inputBlock: { marginTop: RFValue(14) },
  inputLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "PoppinsMedium", fontSize: RFValue(11), marginBottom: RFValue(4) },
  input: {
    borderRadius: RFValue(10),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(8),
    color: "#fff",
    fontFamily: "Poppins",
    fontSize: RFValue(12),
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  err: { color: "#ffb4b4", fontFamily: "Poppins", fontSize: RFValue(10), marginTop: RFValue(6) },
  row: { flexDirection: "row", gap: RFValue(8), justifyContent: "flex-end", marginTop: RFValue(14) },
  btn: { flex: 1, paddingVertical: RFValue(9), borderRadius: RFValue(999), alignItems: "center", justifyContent: "center" },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  btnPrimary: { backgroundColor: GOLD },
  btnSecondaryText: { color: "#fff", fontFamily: "PoppinsMedium", fontSize: RFValue(12) },
  btnPrimaryText: { color: "#111", fontFamily: "PoppinsSemiBold", fontSize: RFValue(12) },
});
