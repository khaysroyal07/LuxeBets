import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";
const BORDER = "rgba(255,255,255,0.1)";
const CARD_BG = "rgba(0,0,0,0.6)";

/* week window helper using tournaments.start_date */
const ANCHOR_WEEKDAY = 2; // Tue
const toLocalISO = (d: Date) => {
  const y = d.getFullYear(), m = `${d.getMonth()+1}`.padStart(2,"0"), day = `${d.getDate()}`.padStart(2,"0");
  return `${y}-${m}-${day}`;
};
function currentWindow(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = base.getDay();
  const diff = (dow - ANCHOR_WEEKDAY + 7) % 7;
  const start = new Date(base); start.setDate(start.getDate() - diff);
  const end = new Date(start); end.setDate(start.getDate() + 2);
  return { startISO: toLocalISO(start), endISO: toLocalISO(end) };
}
const humanDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

export default function TournamentHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (alive) setRows([]); return; }

        // my entries
        const { data: myEntries, error: eErr } = await supabase
          .from("entries")
          .select("id, tournament_id, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (eErr) throw eErr;

        const tIds = Array.from(new Set((myEntries || []).map(e => e.tournament_id)));
        if (tIds.length === 0) { if (alive) setRows([]); return; }

        // tournaments (new schema)
        const { data: tours, error: tErr } = await supabase
          .from("tournaments")
          .select("id, title, entry_fee_cents, start_date, end_date")
          .in("id", tIds)
          .order("start_date", { ascending: false });
        if (tErr) throw tErr;

        const { startISO, endISO } = currentWindow();

        // History = outside current Tue–Thu
        const history = (tours || []).filter((t: any) => {
          const iso = String(t?.start_date || "");
          return !(iso >= startISO && iso <= endISO);
        });

        const entByTid = new Map<string, any>();
        (myEntries || []).forEach((e) => { if (!entByTid.has(String(e.tournament_id))) entByTid.set(String(e.tournament_id), e); });

        const rows = history.map((t: any) => {
          const ent = entByTid.get(String(t.id));
          const name = t.title || (t.entry_fee_cents ? `Tournament $${t.entry_fee_cents/100}` : "Tournament");
          return {
            id: String(ent?.id ?? t.id),
            name,
            dateISO: t.start_date,
            dateHuman: humanDate(t.start_date),
            entryFee: t.entry_fee_cents ? t.entry_fee_cents/100 : 0,
            status: ent?.status || "—",
          };
        });

        if (alive) setRows(rows);
      } catch (err) {
        console.warn("history error:", err);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const renderItem = ({ item }: any) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.dateTxt}>{item.dateHuman}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.line}>
          Entry: <Text style={styles.price}>${Number(item.entryFee ?? 0).toFixed(2)}</Text>
        </Text>
        <View style={[styles.pill, pillStyleForStatus(item.status)]}>
          <Text style={styles.pillTxt}>{String(item.status || "—").toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} size="large" /></View>;
  }

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{ padding: RFValue(16), paddingTop: RFValue(44), paddingBottom: RFValue(50) }}
        data={rows}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Tournament History</Text>
          </View>
        }
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: RFValue(10) }} />}
        ListEmptyComponent={<Text style={{ color: "#ddd" }}>No history yet.</Text>}
      />
    </ImageBackground>
  );
}

/* --- pills --- */
function pillStyleForStatus(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "winner")     return { backgroundColor: "rgba(0,255,170,0.15)", borderColor: "rgba(0,255,170,0.35)" };
  if (s === "eliminated") return { backgroundColor: "rgba(255,80,80,0.15)", borderColor: "rgba(255,80,80,0.35)" };
  if (s === "active")     return { backgroundColor: "rgba(97,61,193,0.18)", borderColor: "rgba(97,61,193,0.4)" };
  return { backgroundColor: "rgba(255,255,255,0.12)", borderColor: BORDER };
}

/* --- styles --- */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0d0013" },
  back:   { marginTop: RFValue(8), marginBottom: RFValue(10), color: PURPLE, fontWeight: "700", fontSize: RFValue(16) },
  title:  { color: "#fff", fontWeight: "900", fontSize: RFValue(22), marginBottom: RFValue(10) },

  card:   { backgroundColor: CARD_BG, padding: RFValue(16), borderRadius: RFValue(16), borderColor: BORDER, borderWidth: 1 },
  name:   { color: "#fff", fontWeight: "900", fontSize: RFValue(16) },
  dateTxt:{ color: "#ccc", marginTop: RFValue(4), marginBottom: RFValue(6) },

  line:   { color: "#ddd", fontSize: RFValue(12) },
  metaRow:{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: RFValue(6) },
  price:  { color: GOLD, fontWeight: "800" },

  pill:   { paddingHorizontal: RFValue(10), paddingVertical: RFValue(4), borderRadius: RFValue(999), borderWidth: 1 },
  pillTxt:{ color: "#fff", fontWeight: "800", fontSize: RFValue(11), letterSpacing: 0.2 },
});
