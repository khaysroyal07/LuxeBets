// app/profile/index.js
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const CYAN = "#00D2FF";
const STAR_BG = require("@/assets/images/bgDash.png"); // <- your starry background
const AVATAR_PLACEHOLDER = require("@/assets/images/avatar.png"); // add a simple circle avatar image (or use Ionicons)

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    username: "TopDogBetter769",
    full_name: "Wednesday Adams",
    avatar_url: "",
    wins: 2,
    tournaments: 122,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        // Pull profile + simple stats (adjust column names to your schema)
        const { data: p, error } = await supabase
          .from("profiles")
          .select("username, full_name, avatar_url, wins, tournaments_count")
          .eq("id", user.id)
          .maybeSingle();

        if (!mounted) return;

        if (error || !p) {
          setLoading(false);
          return;
        }

        setProfile({
          username: p.username || "",
          full_name: p.full_name || "",
          avatar_url: p.avatar_url || "",
          wins: p.wins ?? 0,
          tournaments: p.tournaments_count ?? 0,
        });
        setLoading(false);
      } catch {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const avatarSource = useMemo(() => {
    if (profile.avatar_url) return { uri: profile.avatar_url };
    return AVATAR_PLACEHOLDER;
  }, [profile.avatar_url]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#2C0735", "#14021C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ImageBackground source={STAR_BG} resizeMode="cover" style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        {/* Header spacer */}
        <View style={{ height: RFValue(24) }} />

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatarOuter}>
            <Image source={avatarSource} style={styles.avatar} />
          </View>
        </View>

        {/* Inputs (read-only look) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>User Name</Text>
          <View style={styles.inputWrap}>
            <TextInput
              editable={false}
              value={profile.username}
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputWrap}>
            <TextInput
              editable={false}
              value={profile.full_name}
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {/* Wins */}
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={RFValue(28)} color={GOLD} />
            <Text style={styles.statNumber}>{profile.wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>

          {/* Tournaments (pressable) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push("/tournaments/TournamentHistory")}
            style={[styles.statCard, styles.statCardPressable]}
          >
            <Ionicons name="ribbon" size={RFValue(28)} color={CYAN} />
            <Text style={[styles.statNumber, { color: CYAN }]}>{profile.tournaments}</Text>
            <Text style={[styles.statLabel, { color: CYAN }]}>Tournaments</Text>
          </TouchableOpacity>
        </View>

        {/* Edit button */}
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push("/profile/edit")}
          activeOpacity={0.9}
        >
          <Text style={styles.editText}>Edit profile</Text>
        </TouchableOpacity>

        {/* Bottom quick-nav (optional, matches your mock’s vibe) */}
        <View style={styles.bottomDock}>
          <TouchableOpacity style={styles.dockBtn} onPress={() => router.push("/wallet")}>
            <Ionicons name="card" size={RFValue(18)} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dockBtn} onPress={() => router.push("/(tabs)")} >
            <Ionicons name="home" size={RFValue(18)} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dockBtn} onPress={() => router.push("/tournaments/TournamentHistory")} >
            <Ionicons name="trophy" size={RFValue(18)} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dockBtn} onPress={() => router.push("/user/settings")}>
            <Ionicons name="settings" size={RFValue(18)} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CARD_BG = "rgba(255,255,255,0.1)";
const BORDER = "rgba(255,255,255,0.25)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0013" },
  scroll: { paddingHorizontal: RFValue(16), paddingBottom: RFValue(40) },

  avatarWrap: { alignItems: "center", justifyContent: "center", marginBottom: RFValue(20) },
  avatarOuter: {
    width: RFValue(120),
    height: RFValue(120),
    borderRadius: RFValue(60),
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BORDER,
    overflow: "hidden",
  },
  avatar: { width: "86%", height: "86%", resizeMode: "cover", borderRadius: 999 },

  fieldGroup: { marginBottom: RFValue(14) },
  label: {
    color: "#fff",
    opacity: 0.9,
    fontSize: RFValue(12),
    marginBottom: RFValue(6),
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RFValue(8),
    paddingHorizontal: RFValue(12),
    paddingVertical: Platform.select({ ios: RFValue(12), android: RFValue(8) }),
  },
  input: {
    color: "#fff",
    fontSize: RFValue(14),
    padding: 0,
  },

  statsRow: {
    flexDirection: "row",
    gap: RFValue(12),
    marginTop: RFValue(6),
    marginBottom: RFValue(10),
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: RFValue(14),
    paddingVertical: RFValue(14),
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  statCardPressable: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  statNumber: {
    marginTop: RFValue(6),
    fontSize: RFValue(18),
    fontWeight: "700",
    color: GOLD,
  },
  statLabel: {
    fontSize: RFValue(12),
    marginTop: RFValue(2),
    color: "#FFD700",
    opacity: 0.85,
  },

  editBtn: {
    alignSelf: "center",
    marginTop: RFValue(10),
    backgroundColor: "#ffffff",
    paddingVertical: RFValue(12),
    paddingHorizontal: RFValue(22),
    borderRadius: RFValue(12),
  },
  editText: { color: "#000", fontWeight: "700", fontSize: RFValue(14) },

  bottomDock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: RFValue(18),
    padding: RFValue(10),
    marginTop: RFValue(22),
  },
  dockBtn: {
    backgroundColor: "#000",
    borderRadius: RFValue(12),
    paddingVertical: RFValue(10),
    paddingHorizontal: RFValue(16),
  },

  loading: {
    position: "absolute",
    top: RFValue(24),
    right: RFValue(16),
  },
});
