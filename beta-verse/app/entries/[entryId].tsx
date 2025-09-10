// app/entries/[entryId].js
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, ActivityIndicator,
  TouchableOpacity, ScrollView, Alert
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const PURPLE = "#613DC1";
const GOLD   = "#FFD700";
const DARK   = "#1a1a1a";

export default function EntryDetail() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [entry, setEntry]     = useState(null);  // { id, tournament_id, user_id }
  const [tour, setTour]       = useState(null);  // tournaments row
  const [games, setGames]     = useState([]);    // from games_slate
  const [pick, setPick]       = useState(null);  // { game_id, side: 'home'|'away' }

  const dayISO = tour?.day_date || null;

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);

        // entrant + tournament (RLS scopes to me)
        const { data: e, error: eErr } = await supabase
          .from("entrants")
          .select(`
            id, tournament_id, user_id, status,
            tournaments:tournament_id (
              id, week_label, league_name, day_date,
              start_at, join_close_at, entry_fee
            )
          `)
          .eq("id", entryId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (!e) throw new Error("Entry not found");
        if (!on) return;

        setEntry({ id: e.id, tournament_id: e.tournament_id, user_id: e.user_id });
        setTour(e.tournaments);

        // existing pick for me (user_id) on that day
        const { data: pExisting } = await supabase
          .from("picks")
          .select("game_id, selection")
          .eq("tournament_id", e.tournament_id)
          .eq("user_id", e.user_id)
          .eq("day_date", e.tournaments.day_date)
          .maybeSingle();
        if (pExisting) setPick({ game_id: pExisting.game_id, side: pExisting.selection });

        // slate
        await loadSlate(e.tournaments.day_date, setGames);
      } catch (err) {
        Alert.alert("Error", String(err?.message || err));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [entryId]);

  const title = useMemo(() => {
    if (!tour) return "Entry";
    const wk = tour.week_label || `Week of ${tour.day_date}`;
    return `${wk} • ${String(tour.league_name || "ANY")}`;
  }, [tour]);

  const savePick = async () => {
    try {
      if (!entry || !tour) return;
      if (!pick?.game_id || !pick?.side) {
        return Alert.alert("Pick required", "Tap Home or Away for a game first.");
      }
      setSaving(true);

      // IMPORTANT: selection must be 'home'|'away' to pass picks_selection_check
      const { error } = await supabase.from("picks").upsert({
        tournament_id: entry.tournament_id,
        user_id: entry.user_id,
        day_date: tour.day_date,
        game_id: String(pick.game_id),
        selection: pick.side,       // <- satisfies CHECK (home|away)
        result: "pending",
      }, { onConflict: "tournament_id,user_id,day_date" });
      if (error) throw error;
      Alert.alert("Saved", "Your pick has been saved.");
    } catch (e) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    );
  }

  const closeTxt = tour?.join_close_at ? new Date(tour.join_close_at).toLocaleString() : "—";
  const startTxt = tour?.start_at ? new Date(tour.start_at).toLocaleString() : "—";

  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={{ flex: 1 }} resizeMode="cover">
      <ScrollView contentContainerStyle={{ padding: RFValue(16), paddingBottom: RFValue(120) }}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>
          Day: {dayISO || "—"}  ·  First game {startTxt}{"\n"}
          Join closes {closeTxt}
        </Text>

        <View style={s.card}>
          {games.length === 0 ? (
            <Text style={{ color:"#bbb" }}>No games in this slate.</Text>
          ) : (
            games.map(g => {
              const isPicked = pick?.game_id === g.id;
              return (
                <View key={g.id} style={[s.gameRow, isPicked && { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.06)" }]}>
                  <View style={s.teamsRow}>
                    <TouchableOpacity
                      onPress={() => setPick({ game_id: g.id, side: "away" })}
                      style={[s.sideBtn, pick?.game_id===g.id && pick?.side==="away" && s.sideSelected]}
                    >
                      <Text style={s.sideTxt} numberOfLines={2} ellipsizeMode="tail">{g.away}</Text>
                    </TouchableOpacity>

                    <Text style={s.vs}>@</Text>

                    <TouchableOpacity
                      onPress={() => setPick({ game_id: g.id, side: "home" })}
                      style={[s.sideBtn, pick?.game_id===g.id && pick?.side==="home" && s.sideSelected]}
                    >
                      <Text style={s.sideTxt} numberOfLines={2} ellipsizeMode="tail">{g.home}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.final}>
                    {new Date(g.start_utc).toLocaleTimeString()} · {g.league?.toUpperCase?.()} {g.status ? `· ${g.status}` : ""}
                  </Text>
                </View>
              );
            })
          )}

          <TouchableOpacity onPress={savePick} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.7 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>Save Pick</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

/* ---- helpers ---- */
async function loadSlate(dayISO, setGames) {
  try {
    const { data, error } = await supabase.functions.invoke("games_slate", {
      body: { day: dayISO, sports: ["nfl","mlb","nba"] }  // nfl is enabled; others return empty if unauthorized
    });
    if (error) throw error;
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    setGames(payload?.games || []);
  } catch (e) {
    console.warn("Slate error", e);
    setGames([]);
  }
}

/* ---- styles (kept in your vibe, with better readability for long names) ---- */
const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: RFValue(20), fontWeight: "900", marginTop: RFValue(8) },
  sub: { color: "#ccc", fontSize: RFValue(12), marginTop: RFValue(6), lineHeight: RFValue(16) },

  card: { backgroundColor: "rgba(0,0,0,0.55)", padding: RFValue(14), borderRadius: RFValue(14),
          borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginTop: RFValue(12) },

  gameRow: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: RFValue(12),
             padding: RFValue(10), marginVertical: RFValue(6), backgroundColor: "rgba(0,0,0,0.4)" },

  teamsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: RFValue(8) },
  sideBtn: { flex: 1, backgroundColor: "#333", borderRadius: RFValue(10),
             paddingVertical: RFValue(8), paddingHorizontal: RFValue(10), alignItems: "center", minHeight: RFValue(44) },
  sideSelected: { backgroundColor: PURPLE },
  sideTxt: { color: "#fff", fontWeight: "800", textAlign: "center", flexShrink: 1, minWidth: 0 },
  vs: { color: "#fff", marginHorizontal: RFValue(8), fontWeight: "900" },
  final: { color: "#bbb", marginTop: RFValue(6), fontSize: RFValue(12) },

  saveBtn: { backgroundColor: "#2c91a1", padding: RFValue(12), borderRadius: RFValue(12),
             marginTop: RFValue(8), alignItems: "center" },
  saveTxt: { color: "#fff", fontWeight: "900" },

  backBtn: { alignItems: "center", padding: RFValue(10), marginTop: RFValue(8) },
  backTxt: { color: PURPLE, fontWeight: "800" },
});
