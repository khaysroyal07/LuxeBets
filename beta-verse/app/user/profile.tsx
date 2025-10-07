// app/user/profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, TextInput,
  Alert, ScrollView, Image, Modal
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/AuthContext";

const BG = require("@/assets/images/Signup.png");
const GOLD = "#FFD700";
const CARD_BG = "rgba(25, 20, 55, 0.58)";
const CARD_BORDER = "rgba(255, 215, 0, 0.35)";
const DIV = "rgba(255,255,255,0.18)";

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  state: string | null;
  avatar_url: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({ email: "", username: "", phone: "" });
  const [uploading, setUploading] = useState(false);

  const initials = useMemo(() => {
    const n = profile?.full_name || "";
    const parts = n.trim().split(/\s+/).slice(0, 2);
    const init = parts.map((p) => (p[0] || "").toUpperCase()).join("");
    return init || "BV";
  }, [profile?.full_name]);

  const load = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,full_name,email,phone,country,state,avatar_url")
        .eq("id", user?.id)
        .maybeSingle();
      if (error) throw error;
      setProfile(data as Profile);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.id) load(); }, [user?.id]);
  useEffect(() => {
    if (editOpen && profile) {
      setEdit({
        email: profile.email ?? "",
        username: profile.username ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [editOpen, profile]);

  const saveEdit = async () => {
    try {
      setSaving(true);
      if (edit.email.trim() && edit.email.trim() !== (profile?.email ?? "")) {
        const { error: aErr } = await supabase.auth.updateUser({ email: edit.email.trim() });
        if (aErr) throw aErr;
      }
      const { error: pErr } = await supabase.from("profiles").update({
        email: edit.email.trim(),
        username: edit.username.trim(),
        phone: edit.phone.trim(),
      }).eq("id", user?.id);
      if (pErr) throw pErr;
      setEditOpen(false);
      await load();
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const chooseAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo access to set your profile picture.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true, aspect: [1, 1], quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      const fileResp = await fetch(asset.uri);
      const blob = await fileResp.blob();
      const ext = asset.fileName?.split(".").pop() || "jpg";
      const path = `avatars/${user?.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: blob.type || "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      const { error: profErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user?.id);
      if (profErr) throw profErr;
      await load();
      Alert.alert("Done", "Profile photo updated.");
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  };

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
    <ImageBackground source={BG} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="chevron-back" size={RFValue(16)} color="#000" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Header card */}
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={chooseAvatar} activeOpacity={0.9} style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.ring} />
            <View style={styles.camBadge}>
              <Ionicons name={uploading ? "cloud-upload-outline" : "camera-outline"} size={RFValue(12)} color="#000" />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nameText} numberOfLines={1}>{profile?.full_name || "—"}</Text>
            <Text style={styles.userText} numberOfLines={1}>@{profile?.username || "username"}</Text>
          </View>

          <TouchableOpacity onPress={() => setEditOpen(true)} style={styles.editBtn} activeOpacity={0.9}>
            <Ionicons name="create-outline" size={RFValue(14)} color="#000" />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Contact */}
        <GlassCard title="Contact">
          <KV label="Email" value={profile?.email ?? "—"} />
          <KV label="Phone" value={profile?.phone ?? "—"} />
          <Text style={styles.helperText}>Name & location are read-only. To change them, details must match your ID.</Text>
        </GlassCard>

        {/* Location */}
        <GlassCard title="Location">
          <View style={styles.rowSpread}>
            <KV label="Country" value={profile?.country ?? "—"} half />
            <View style={{ width: 12 }} />
            <KV label="State/Region" value={profile?.state ?? "—"} half />
          </View>
        </GlassCard>

        {/* Actions */}
        <GlassCard title="Security & Tools" padTopSmall>
          <RowLink label="Manage 2FA & Password" icon="shield-checkmark-outline" onPress={() => router.push("/user/security")} />
          <RowLink label="Responsible Gambling Limits" icon="timer-outline" onPress={() => router.push("/user/responsible")} />
          <RowLink label="Notification Settings" icon="notifications-outline" onPress={() => router.push("/user/notifications")} last />
        </GlassCard>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOut} onPress={handleSignOut} activeOpacity={0.9}>
          <Ionicons name="exit-outline" size={RFValue(14)} color="#4B0000" />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Underlined placeholder="Email" value={edit.email} onChangeText={(v: string) => setEdit((p) => ({ ...p, email: v }))} keyboardType="email-address" autoCapitalize="none" />
            <Underlined placeholder="Username" value={edit.username} onChangeText={(v: string) => setEdit((p) => ({ ...p, username: v }))} autoCapitalize="none" />
            <Underlined placeholder="Phone" value={edit.phone} onChangeText={(v: string) => setEdit((p) => ({ ...p, phone: v }))} keyboardType="phone-pad" />

            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={saveEdit} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>Name & location changes require ID verification.</Text>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

/* Components */

function GlassCard({ children, title, padTopSmall }: { children: React.ReactNode; title: string; padTopSmall?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={[styles.cardInner, padTopSmall && { paddingTop: 8 }]}>{children}</View>
    </View>
  );
}
function RowLink({ label, onPress, icon, last }: { label: string; onPress: () => void; icon: any; last?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.rowLink, last && { borderBottomWidth: 0 }]}>
        <View style={styles.rowLeft}>
          <Ionicons name={icon} size={RFValue(14)} color="#fff" />
          <Text style={styles.rowLabel}>{label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={RFValue(16)} color="rgba(255,255,255,0.9)" />
      </View>
    </TouchableOpacity>
  );
}
function KV({ label, value, half }: { label: string; value: string; half?: boolean }) {
  return (
    <View style={[{ marginBottom: 10 }, half && { flex: 1 }]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}
function Underlined(props: any) {
  return (
    <View style={{ marginBottom: RFValue(14) }}>
      <TextInput {...props} placeholderTextColor="rgba(255,255,255,0.95)" style={styles.underlined} />
    </View>
  );
}

/* Styles */

const styles = StyleSheet.create({
  // ↑ increased a bit to fix “top of card” spacing
  scroll: { paddingHorizontal: 18, paddingBottom: 34, paddingTop: RFValue(44) },

  topBar: {
    width: "100%",
    marginBottom: RFValue(12), // a touch more space before the card
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  backBtn: {
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: { color: "#000", fontWeight: "900", fontSize: RFValue(11) },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    paddingVertical: 14, // +2px vertical for nicer centering
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  avatarWrap: { width: RFValue(68), height: RFValue(68) },
  avatar: {
    width: RFValue(68),
    height: RFValue(68),
    borderRadius: RFValue(34),
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    width: RFValue(68),
    height: RFValue(68),
    borderRadius: RFValue(34),
  },
  avatarInitials: { color: "#000", fontSize: RFValue(18), fontWeight: "900" },
  ring: {
    position: "absolute",
    width: RFValue(84),
    height: RFValue(84),
    borderRadius: RFValue(42),
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    top: -8, left: -8,
  },
  camBadge: {
    position: "absolute",
    right: -2, bottom: -2,
    backgroundColor: GOLD,
    borderRadius: 999,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
  },

  nameText: { color: GOLD, fontSize: RFValue(16), fontWeight: "900" },
  userText: { color: "white", opacity: 0.9, fontSize: RFValue(11), marginTop: 2 },

  card: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: { color: GOLD, fontSize: RFValue(13.5), fontWeight: "900", marginBottom: 8 },
  cardInner: { paddingTop: 2 },

  kvLabel: { color: "rgba(255,255,255,0.9)", fontSize: RFValue(10), marginBottom: 2 },
  kvValue: { color: "white", fontSize: RFValue(12), fontWeight: "700" },
  rowSpread: { flexDirection: "row", alignItems: "flex-start" },

  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DIV,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: "white", fontSize: RFValue(12) },

  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: GOLD,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editText: { color: "#000", fontSize: RFValue(11), fontWeight: "900" },

  signOut: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    backgroundColor: "rgba(255,215,0,0.12)",
  },
  signOutText: { color: "#4B0000", fontSize: RFValue(12), fontWeight: "800" },

  underlined: {
    color: "white",
    fontSize: RFValue(12),
    paddingVertical: RFValue(7),
    paddingLeft: 0,
    paddingRight: 0,
    borderBottomWidth: 1.2,
    borderBottomColor: "rgba(255,255,255,0.95)",
  },

  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
  modalCard: { backgroundColor: CARD_BG, borderColor: CARD_BORDER, borderWidth: 1, borderRadius: 18, padding: 16 },
  modalTitle: { color: GOLD, fontSize: RFValue(15), fontWeight: "900", marginBottom: 10 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center" },
  modalCancel: { borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  modalSave: { backgroundColor: GOLD },
  modalCancelText: { color: "white", fontWeight: "800", fontSize: RFValue(12) },
  modalSaveText: { color: "#000", fontWeight: "900", fontSize: RFValue(12) },
  modalNote: { color: "rgba(255,255,255,0.95)", fontSize: RFValue(10), marginTop: 8, textAlign: "center" },

  helperText: { marginTop: 6, color: "rgba(255,255,255,0.95)", fontSize: RFValue(10) },
});
