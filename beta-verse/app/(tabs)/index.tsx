// app/(tabs)/index.tsx — Dash (FREE TSDB only; keep original style; fix filters)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet, FlatList, Dimensions,
  ActivityIndicator, ImageBackground, LayoutAnimation, Platform, UIManager,
  Pressable, Modal, RefreshControl
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

const { width } = Dimensions.get("window");
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------- Free API (TheSportsDB) ---------------- */
const TSD_KEY =
  process.env.EXPO_PUBLIC_TSPORTSDB_KEY ||
  (Constants?.expoConfig?.extra as any)?.THESPORTSDB_KEY ||
  "123"; // demo key fallback

const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(TSD_KEY)}`;

type SportKey = "nba" | "wnba" | "mlb" | "nfl" | "nhl";

/* Map to TSDB sport param + league name filters to keep US majors only */
const SPORT_CONFIG: Record<SportKey, {
  label: string;
  tsdbSport: string;
  leagues: string[];
  iconUrl: string;
}> = {
  nba:  { label: "NBA",  tsdbSport: "Basketball",        leagues: ["NBA"], iconUrl: "https://img.icons8.com/ios-filled/100/basketball.png" },
  wnba: { label: "WNBA", tsdbSport: "Basketball",        leagues: ["WNBA","Women's National Basketball Association"], iconUrl: "https://img.icons8.com/fluency/100/basketball-2.png" },
  mlb:  { label: "MLB",  tsdbSport: "Baseball",          leagues: ["MLB","Major League Baseball"], iconUrl: "https://img.icons8.com/ios-filled/100/baseball.png" },
  nfl:  { label: "NFL",  tsdbSport: "American_Football", leagues: ["NFL","National Football League"], iconUrl: "https://img.icons8.com/ios-filled/100/american-football.png" },
  nhl:  { label: "NHL",  tsdbSport: "Ice_Hockey",        leagues: ["NHL","National Hockey League"], iconUrl: "https://img.icons8.com/ios-filled/100/ice-hockey.png" },
};
const SPORTS = Object.keys(SPORT_CONFIG) as SportKey[];
const YEAR_OPTIONS = ["Auto", 2025, 2024, 2023, 2022];

const defaultTeamLogo =
  "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg";

/* ---------------- Theme & Utils ---------------- */
const GOLD = "#FFD700";
const PURPLE = "#613DC1";
const DEFAULT_TIER = "20";

const sanitizeUrl = (u?: string|null) => {
  if (!u) return null;
  try {
    const t = u.trim();
    return t.startsWith("http://") ? "https://" + t.slice(7) : t;
  } catch { return null; }
};
const parseGameDate = (s?: string) => {
  if (!s) return null;
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
};
function statusBucketFromTSDB(e: any) {
  const prog = String(e?.strProgress || "").toLowerCase();
  const stat = String(e?.strStatus || "").toLowerCase();
  const hs = e?.intHomeScore != null ? Number(e.intHomeScore) : null;
  const as = e?.intAwayScore != null ? Number(e.intAwayScore) : null;

  const ts = e?.strTimestamp || (e?.dateEvent ? `${e.dateEvent}T${(e?.strTime || "00:00")}:00Z` : null);
  const dt = ts ? parseGameDate(ts) : null;

  if (/live|inplay|in play|q1|q2|q3|q4|ot|so|ht|inning|period|half/.test(prog)) return "LIVE";
  if (/final|finished|ft|full time|ended|complete/.test(stat)) return "FINAL";
  if ((hs != null || as != null) && dt && dt.getTime() < Date.now()) return "FINAL";
  if (dt && dt.getTime() > Date.now()) return "UPCOMING";
  return "UPCOMING";
}
const tagStyle = (b: "LIVE"|"UPCOMING"|"FINAL") =>
  b==="LIVE"?{bg:"#22c55e",fg:"#0a2915"}:b==="UPCOMING"?{bg:"#f59e0b",fg:"#2b1a00"}:{bg:"#6b7280",fg:"#0d1117"};

function relativeWhen(ms?: number,b?: "FINAL"|"UPCOMING"|"LIVE"){
  if(!ms) return "";
  const now=Date.now(), diff=ms-now, abs=Math.abs(diff);
  const min=Math.round(abs/60000), h=Math.floor(min/60), m=min%60;
  if(b==="FINAL"){ if(h>=24)return`${Math.floor(h/24)}d ago`; if(h>=1)return`${h}h ago`; return`${m}m ago`; }
  if(diff<=0)return"now";
  if(h>=24)return`in ${Math.floor(h/24)}d`;
  if(h>=1)return`in ${h}h ${m?m+"m":""}`.trim();
  return`in ${m}m`;
}

/* ==== composite key + dedupe ==== */
const makeEventKey = (sportKey: string, g: any) =>
  `${sportKey}:${String(g.id ?? `${g.homeName}-${g.awayName}`)}:${String(g.rawDate ?? 0)}`;

const uniqByKey = (sportKey: string, list: any[]) => {
  const seen = new Set<string>();
  return (list || []).filter(g => {
    const k = makeEventKey(sportKey, g);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/* ---------------- TSDB fetchers ---------------- */
function dayISO(d: Date){ return d.toISOString().slice(0,10); }

async function fetchTSDBByDate(sport: SportKey, dateISO: string){
  const cfg = SPORT_CONFIG[sport];
  const url = `${TSD_BASE}/eventsday.php?s=${encodeURIComponent(cfg.tsdbSport)}&d=${encodeURIComponent(dateISO)}`;
  const r = await fetch(url);
  if(!r.ok) return [];
  const j = await r.json();
  const events = Array.isArray(j?.events) ? j.events : [];
  const allow = cfg.leagues.map(l => l.toLowerCase());
  return events.filter((e:any) => {
    const lg = String(e?.strLeague || "").toLowerCase();
    return allow.some(x => lg.includes(x));
  });
}

async function fetchWindowSerial_TSDB(sport: SportKey, center: Date, aheadDays:number, backDays:number, stopAfter:number){
  const out:any[]=[];
  for(let i=0;i<=aheadDays;i++){
    const dt = new Date(center); dt.setDate(dt.getDate()+i);
    const arr = await fetchTSDBByDate(sport, dayISO(dt));
    out.push(...arr); if(out.length>=stopAfter)break;
  }
  if(out.length<stopAfter){
    for(let i=1;i<=backDays;i++){
      const dt = new Date(center); dt.setDate(dt.getDate()-i);
      const arr = await fetchTSDBByDate(sport, dayISO(dt));
      out.push(...arr); if(out.length>=stopAfter)break;
    }
  }
  return out;
}

async function fetchYearSamples_TSDB(sport: SportKey, year:number){
  const sample=[new Date(`${year}-01-15`),new Date(`${year}-04-15`),new Date(`${year}-08-15`),new Date(`${year}-11-15`)];
  let res:any[]=[]; for(const d of sample){ const c=await fetchWindowSerial_TSDB(sport, d, 2, 2, 30); res=res.concat(c); if(res.length>=40)break; }
  return res;
}

/* ---------------- Atoms ---------------- */
function TeamAvatar({ uri, name }: { uri?: string|null; name?: string }) {
  const [err, setErr] = useState(false);
  const good = !err && sanitizeUrl(uri || null);
  if (good) return <Image source={{ uri: good }} onError={() => setErr(true)} style={styles.teamLogo} />;
  const initials=(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")||"??";
  return (<View style={styles.avatarFallback}><Text style={styles.avatarInitials}>{initials}</Text></View>);
}
function Chip({ label, selected, onPress, style }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.chip, selected && styles.chipSelected, style]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ---------- Player streaks (same) ---------- */
const MOCK_STREAKS = [
  { id: "1", name: "Ava King",  streak: 8, avatarUrl: "https://i.pravatar.cc/100?img=5" },
  { id: "2", name: "Noah Lee",  streak: 6, avatarUrl: "https://i.pravatar.cc/100?img=12" },
  { id: "3", name: "Maya Cruz", streak: 5, avatarUrl: "https://i.pravatar.cc/100?img=32" },
  { id: "4", name: "Owen Kim",  streak: 4, avatarUrl: "https://i.pravatar.cc/100?img=44" },
  { id: "5", name: "Liam Fox",  streak: 3, avatarUrl: "https://i.pravatar.cc/100?img=14" },
];
function trophyForRank(rank:number){
  if(rank===1) return { uri:"https://img.icons8.com/fluency/96/trophy.png" };
  if(rank===2) return { uri:"https://img.icons8.com/color/96/silver-medal.png" };
  if(rank===3) return { uri:"https://img.icons8.com/color/96/bronze-medal.png" };
  return null;
}

/* ---------------- Screen ---------------- */
export default function Dash(){
  const [selectedSportIndex,setSelectedSportIndex]=useState(0);
  const [selectedYear,setSelectedYear]=useState<"Auto"|number>("Auto");

  const [events,setEvents]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [note,setNote]=useState("");

  const [showFilter,setShowFilter]=useState(false);
  const [quickFilter,setQuickFilter]=useState<"ALL"|"LIVE"|"UPCOMING"|"FINAL">("ALL");
  const [todayOnly,setTodayOnly]=useState(false);
  const [sortMode,setSortMode]=useState<"smart"|"timeAsc"|"timeDesc">("smart");

  // profile dropdown + streaks modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [streaks, setStreaks] = useState<any[]>([]);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState("");

  const router=useRouter();
  const [fontsLoaded]=useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  const sportKey = SPORTS[selectedSportIndex];
  const sportCfg = SPORT_CONFIG[sportKey];

  // safe navigation
  const go = useCallback((path: string) => {
    setProfileOpen(false);
    requestAnimationFrame(() => router.push(path as any));
  }, [router]);

  /* -------- Enrich TSDB events into card model -------- */
  function pickShortAndName(full?: string){
    const name = (full||"").trim();
    if(!name) return { short: "TEAM", name: "Team" };
    const parts = name.split(/\s+/);
    const nickname = parts.length>1 ? parts.slice(1).join(" ") : name;
    const short = parts.map(p => p[0]).join("").slice(0,3).toUpperCase() || name.slice(0,3).toUpperCase();
    return { short, name: nickname || name };
  }

  function enrichGames_TSDB(list:any[]){
    return (list||[]).map((e:any)=>{
      const ts = e?.strTimestamp || (e?.dateEvent ? `${e.dateEvent}T${(e?.strTime || "00:00")}:00Z` : null);
      const dt = ts ? parseGameDate(ts) : null;

      const bucket = statusBucketFromTSDB(e);

      const home = pickShortAndName(e?.strHomeTeam);
      const away = pickShortAndName(e?.strAwayTeam);

      return {
        id: String(e?.idEvent || `${e?.strHomeTeam}-${e?.strAwayTeam}-${e?.dateEvent}`),
        homeKey: home.short, awayKey: away.short,
        homeName: home.name, awayName: away.name,
        homeLogo: defaultTeamLogo, awayLogo: defaultTeamLogo,
        homeScore: e?.intHomeScore != null ? Number(e.intHomeScore) : null,
        awayScore: e?.intAwayScore != null ? Number(e.intAwayScore) : null,
        when: dt ? `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}` : (e?.dateEvent || ""),
        rawDate: dt ? dt.getTime() : 0,
        bucket,
      };
    });
  }

  function sortEnriched(arr:any[],mode:"smart"|"timeAsc"|"timeDesc"){
    if(!Array.isArray(arr))return [];
    const A=[...arr];
    if(mode==="timeAsc") return A.sort((a,b)=>(a.rawDate||0)-(b.rawDate||0));
    if(mode==="timeDesc")return A.sort((a,b)=>(b.rawDate||0)-(a.rawDate||0));
    const score:{[k:string]:number}={LIVE:0,UPCOMING:1,FINAL:2};
    return A.sort((a,b)=>{
      if(score[a.bucket]!==score[b.bucket]) return score[a.bucket]-score[b.bucket];
      if(a.bucket==="FINAL"&&b.bucket==="FINAL") return (b.rawDate||0)-(a.rawDate||0);
      return (a.rawDate||0)-(b.rawDate||0);
    });
  }

  /* -------- Events loader (TSDB) -------- */
  useEffect(()=>{ let off=false; (async()=>{
      setLoading(true); setEvents([]); setNote("");
      try{
        const now=new Date();
        if(selectedYear==="Auto"){
          if(todayOnly){
            const arr=await fetchTSDBByDate(sportKey, now.toISOString().slice(0,10));
            let e=enrichGames_TSDB(arr);
            const unique=uniqByKey(sportKey, e);
            if(!off){ setEvents(sortEnriched(unique,sortMode)); setNote(unique.length?"":"No games today."); }
            setLoading(false); return;
          }
          // near-term pass
          let list = await fetchWindowSerial_TSDB(sportKey, now, 5, 0, 30);
          let e = enrichGames_TSDB(list);
          let up=e.filter(g=>g.bucket!=="FINAL");

          if(up.length===0){ setNote("Looking ahead for upcoming games…"); list=await fetchWindowSerial_TSDB(sportKey, now, 14, 0, 50); e=enrichGames_TSDB(list); up=e.filter(g=>g.bucket!=="FINAL"); }
          if(up.length===0){ setNote("No upcoming found; showing recent finals…"); list=await fetchWindowSerial_TSDB(sportKey, now, 0, 7, 40); e=enrichGames_TSDB(list); }
          if(!e?.length){ list=await fetchWindowSerial_TSDB(sportKey, now, 0, 21, 60); e=enrichGames_TSDB(list); }
          if(!e?.length){ const yr=now.getFullYear(); setNote(`Sampling ${yr}…`); list=await fetchYearSamples_TSDB(sportKey, yr); e=enrichGames_TSDB(list); }

          const unique=uniqByKey(sportKey, e);
          if(!off) setEvents(sortEnriched(unique,sortMode));
        }else{
          setNote(`Looking in ${selectedYear}…`);
          const list = await fetchYearSamples_TSDB(sportKey, Number(selectedYear));
          const e = enrichGames_TSDB(list);
          const unique=uniqByKey(sportKey, e);
          if(!off){ setEvents(sortEnriched(unique,sortMode)); setNote(unique.length?"":`No results in ${selectedYear}.`); }
        }
      }catch(e){ if(!off){ setEvents([]); setNote("No events to show."); } }
      finally{ if(!off) setLoading(false); }
    })(); return()=>{off=true};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sportKey,selectedYear,todayOnly,sortMode]);

  const shownEvents=useMemo(()=>quickFilter==="ALL"?events:events.filter(e=>e.bucket===quickFilter),[events,quickFilter]);
  if(!fontsLoaded) return null;

  /* -------- Subcomponent to lock column alignment -------- */
  const TeamCol = ({ name, logo }: any) => (
    <View style={styles.teamCol}>
      <TeamAvatar uri={logo} name={name} />
      <View style={styles.teamNameBox}>
        <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
      </View>
    </View>
  );

  const EventCard = ({ item }: any) => {
    const { bg, fg } = tagStyle(item.bucket);
    return (
      <View style={styles.eventWrapper}>
        <View style={styles.eventCardVertical}>
          <BlurView intensity={60} tint="dark" style={styles.eventBgVertical}>
            <LinearGradient
              colors={["rgba(70,7,89,0.9)","rgba(74,46,153,0.5)","rgba(46,29,91,0.8)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.statusWrap}>
              <View style={[styles.statusPill, { backgroundColor: bg }]}>
                <Text style={[styles.statusPillText, { color: fg }]} numberOfLines={1}>
                  {item.bucket}
                </Text>
              </View>
            </View>

            <View style={styles.mainRow}>
              <TeamCol name={item.homeName || item.homeKey} logo={item.homeLogo} />
              <View style={styles.centerCol}>
                <Text style={styles.scoreText} numberOfLines={1}>
                  {item.homeScore ?? "-"} - {item.awayScore ?? "-"}
                </Text>
                <View style={styles.centerMetaBox}>
                  <Text style={styles.dateText} numberOfLines={1} ellipsizeMode="tail">{item.when}</Text>
                  <Text style={styles.relativeText} numberOfLines={1}>{relativeWhen(item.rawDate, item.bucket)}</Text>
                </View>
              </View>
              <TeamCol name={item.awayName || item.awayKey} logo={item.awayLogo} />
            </View>
          </BlurView>
        </View>

        <View style={styles.standingsCardVertical}>
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>{item.homeName}</Text>
            <Text style={styles.standingText} numberOfLines={1}>W-L: - -</Text>
          </View>
          <View style={styles.vDivider} />
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>{item.awayName}</Text>
            <Text style={styles.standingText} numberOfLines={1}>W-L: - -</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSportTab = ({ item: k, index }: any) => {
    const cfg = SPORT_CONFIG[k]; const selected = selectedSportIndex===index;
    return (
      <TouchableOpacity onPress={()=>{ setSelectedSportIndex(index); setSelectedYear("Auto"); setQuickFilter("ALL"); }}
        style={[styles.sportIconHorizontal, selected && { borderColor: GOLD, borderWidth: 2 }]}>
        <Image source={{ uri: cfg.iconUrl }} style={[styles.sportIconSmall, { tintColor: "#fff" }]} />
        <Text style={[styles.sportNameHorizontal, selected && { color: GOLD }]} numberOfLines={1}>{cfg.label}</Text>
      </TouchableOpacity>
    );
  };

  /* ---------- Streaks ---------- */
  const loadStreaks = async () => {
    setStreakLoading(true);
    setStreakError("");
    try { setStreaks(MOCK_STREAKS); } finally { setStreakLoading(false); }
  };

  /* ---------- UI ---------- */
  return (
    <ImageBackground source={require("@/assets/images/bgDash.png")} style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={()=>{ LayoutAnimation.easeInEaseOut(); setShowFilter(s=>!s); }} activeOpacity={0.85}>
          <View style={styles.filterTopBtn}>
            <Image source={{ uri: "https://img.icons8.com/ios-filled/50/filter--v1.png" }} style={{ width: RFValue(18), height: RFValue(18), tintColor: "#111" }} />
            <Text style={styles.filterTopBtnText} numberOfLines={1}>Filters</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.appTitle}>LuxeBETS</Text>

        <View style={{ flexDirection: "row", gap: RFValue(12) }}>
          <TouchableOpacity onPress={() => { setStreakOpen(true); loadStreaks(); }} activeOpacity={0.85}>
            <Image source={{ uri: "https://img.icons8.com/ios-filled/50/leaderboard.png" }} style={[styles.iconSmall, { tintColor: GOLD }]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setProfileOpen((v)=>!v)} activeOpacity={0.85}>
            <Image source={{ uri: "https://img.icons8.com/ios-filled/50/user.png" }} style={[styles.iconSmall, { tintColor: "#fff" }]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter panel */}
      {showFilter && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterTitle}>Quick Filter</Text>
          <View style={styles.filterRow}>
            {["ALL","LIVE","UPCOMING","FINAL"].map(q=>(
              <Chip key={q} label={q} selected={quickFilter===q as any} onPress={()=>setQuickFilter(q as any)} style={{ marginBottom: RFValue(6) }} />
            ))}
          </View>

          <Text style={[styles.filterTitle,{marginTop:RFValue(8)}]}>Time</Text>
          <View style={styles.filterRow}>
            <Chip label={todayOnly ? "Today ✓" : "Today"} selected={todayOnly} onPress={()=>setTodayOnly(v=>!v)} />
          </View>

          <Text style={[styles.filterTitle,{marginTop:RFValue(8)}]}>Year</Text>
          <View style={styles.filterRow}>
            {YEAR_OPTIONS.map((y:any)=>(
              <Chip key={String(y)} label={String(y)} selected={selectedYear===y} onPress={()=>setSelectedYear(y)} style={{ marginBottom: RFValue(6) }} />
            ))}
          </View>

          <Text style={[styles.filterTitle,{marginTop:RFValue(8)}]}>Sort</Text>
          <View style={styles.filterRow}>
            <Chip label="Smart" selected={sortMode==="smart"} onPress={()=>setSortMode("smart")} />
            <Chip label="Time ↑" selected={sortMode==="timeAsc"} onPress={()=>setSortMode("timeAsc")} />
            <Chip label="Time ↓" selected={sortMode==="timeDesc"} onPress={()=>setSortMode("timeDesc")} />
          </View>

          <View style={{ flexDirection:"row", justifyContent:"flex-end", marginTop: RFValue(8) }}>
            <TouchableOpacity
              onPress={()=>{ setQuickFilter("ALL"); setTodayOnly(false); setSortMode("smart"); setSelectedYear("Auto"); setNote(""); LayoutAnimation.easeInEaseOut(); setShowFilter(false); }}
              style={styles.resetBtn} activeOpacity={0.85}
            >
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Profile dropdown */}
      {profileOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} pointerEvents="box-none">
          <Pressable style={styles.overlayTap} onPress={()=>setProfileOpen(false)} />
          <BlurView intensity={70} tint="dark" style={styles.profileMenu}>
            <Pressable style={styles.menuItem} onPress={() => go("/user/profile")}>
              <Image source={{ uri: "https://img.icons8.com/ios-glyphs/30/user--v1.png" }} style={styles.menuIcon} />
              <TouchableOpacity onPress={() => router.push("/profile")}>
                <Text style={styles.menuText}>Profile</Text>
              </TouchableOpacity>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => go("/user/settings")}>
              <Image source={{ uri: "https://img.icons8.com/ios-glyphs/30/settings.png" }} style={styles.menuIcon} />
              <Text style={styles.menuText}>Settings</Text>
            </Pressable>
          </BlurView>
        </View>
      )}

      {/* Streaks modal */}
      <Modal transparent animationType="fade" visible={streakOpen} onRequestClose={()=>setStreakOpen(false)}>
        <View style={styles.modalBackdrop}>
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <LinearGradient
              colors={["rgba(97,61,193,0.25)", "rgba(44,7,53,0.25)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Winning Streaks</Text>
              <TouchableOpacity onPress={()=>setStreakOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {!!streakError && <Text style={styles.modalNote}>{streakError}</Text>}

            <FlatList
              data={streaks}
              keyExtractor={(it, idx)=>String(it?.id ?? idx)}
              refreshControl={<RefreshControl refreshing={streakLoading} onRefresh={loadStreaks} tintColor="#fff" />}
              renderItem={({ item, index }) => {
                const trophy = trophyForRank(index+1);
                const max = Math.max(1, streaks[0]?.streak || 1);
                const barW = Math.max(10, (item.streak / max) * (width * 0.5));
                return (
                  <View style={styles.rankRow}>
                    <Text style={styles.rankNum}>{index+1}</Text>
                    {trophy ? <Image source={trophy} style={styles.trophy} /> : <View style={{ width: RFValue(24) }} />}
                    <Image source={{ uri: item.avatarUrl || defaultTeamLogo }} style={styles.userAvatar} />
                    <View style={{ flex:1 }}>
                      <Text style={styles.rankName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.progressTrack}><View style={[styles.progressBar, { width: barW }]} /></View>
                    </View>
                    <Text style={styles.rankStreak}>W{item.streak}</Text>
                  </View>
                );
              }}
              ListEmptyComponent={!streakLoading ? (<Text style={styles.modalNote}>No players yet.</Text>) : null}
              contentContainerStyle={{ paddingBottom: RFValue(8) }}
              showsVerticalScrollIndicator={false}
            />
          </BlurView>
        </View>
      </Modal>

      <FlatList
        data={shownEvents}
        keyExtractor={(item)=> makeEventKey(sportKey, item)}
        renderItem={({item})=>(
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={()=>router.push({ pathname: "/tournaments", params: { tier: DEFAULT_TIER } } as any)}
          >
            <EventCard item={item} />
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <>
            <FlatList
              data={SPORTS} horizontal showsHorizontalScrollIndicator={false}
              keyExtractor={(k)=>k} renderItem={renderSportTab}
              contentContainerStyle={{ paddingHorizontal: RFValue(10), paddingVertical: RFValue(8) }}
            />
            {loading ? <ActivityIndicator size="small" color={PURPLE} style={{ marginVertical: RFValue(10) }} /> : null}
            {!!note && <Text style={{ color:"#fff", fontFamily:"Poppins", paddingHorizontal:RFValue(14), marginBottom:RFValue(6), opacity:0.8 }}>{note}</Text>}
          </>
        }
        ListEmptyComponent={!loading ? (
          <Text style={{ color:"#fff", fontFamily:"Poppins", textAlign:"center", marginTop:RFValue(24), opacity:0.7 }}>No events to show.</Text>
        ) : null}
        ListFooterComponent={<View style={{ height: RFValue(40) }} />}
        contentContainerStyle={{ paddingBottom: RFValue(96) }}
        showsVerticalScrollIndicator={false}
      />
    </ImageBackground>
  );
}

/* ---------------- Styles (unchanged) ---------------- */
const styles = StyleSheet.create({
  container:{ flex:1, width:"100%", height:"100%" },
  topBar:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
    paddingHorizontal:RFValue(16), paddingTop:RFValue(48), paddingBottom:RFValue(12) },
  iconSmall:{ width:RFValue(28), height:RFValue(28) },
  appTitle:{ fontFamily:"PoppinsBold", fontSize:RFValue(20), color:"white" },
  filterTopBtn:{ flexDirection:"row", alignItems:"center", backgroundColor:GOLD,
    paddingVertical:RFValue(6), paddingHorizontal:RFValue(10), borderRadius:RFValue(12),
    shadowColor:"#000", shadowOpacity:0.15, shadowRadius:6, shadowOffset:{ width:0, height:2 } },
  filterTopBtnText:{ fontFamily:"PoppinsMedium", fontSize:RFValue(12), marginLeft:RFValue(6), color:"#111" },
  filterPanel:{ marginHorizontal:RFValue(10), marginTop:RFValue(4), marginBottom:RFValue(4),
    backgroundColor:"rgba(35,35,35,0.9)", borderRadius:RFValue(14), padding:RFValue(10),
    borderColor:"rgba(255,255,255,0.08)", borderWidth:1 },
  filterTitle:{ color:"#fff", fontFamily:"PoppinsSemiBold", fontSize:RFValue(12), marginBottom:RFValue(4) },
  filterRow:{ flexDirection:"row", flexWrap:"wrap" },
  chip:{ paddingHorizontal:RFValue(12), paddingVertical:RFValue(6), marginRight:RFValue(6), marginTop:RFValue(6),
    borderRadius:RFValue(12), borderWidth:1, borderColor:"rgba(255,255,255,0.2)", backgroundColor:"#2c0735" },
  chipSelected:{ backgroundColor:"#613DC1", borderColor:"#FFD700" },
  chipText:{ fontFamily:"PoppinsMedium", fontSize:RFValue(12), color:"#fff" },
  chipTextSelected:{ color:"#FFD700", fontWeight:"700" },
  resetBtn:{ paddingHorizontal:RFValue(12), paddingVertical:RFValue(6), borderRadius:RFValue(10), backgroundColor:"#FFD700" },
  resetBtnText:{ fontFamily:"PoppinsSemiBold", color:"#111", fontSize:RFValue(12) },
  sportIconHorizontal:{ flexDirection:"row", alignItems:"center", paddingVertical:RFValue(6),
    paddingHorizontal:RFValue(14), borderRadius:RFValue(16), marginHorizontal:RFValue(6), backgroundColor:"#2c0735" },
  sportIconSmall:{ width:RFValue(28), height:RFValue(28), marginRight:RFValue(8) },
  sportNameHorizontal:{ fontFamily:"PoppinsMedium", fontSize:RFValue(14), color:"#fff" },
  eventWrapper:{marginTop:20, marginBottom:RFValue(20), alignItems:"center",display:"flex",justifyContent:"center" },
  eventCardVertical:{ width:width*0.9, borderRadius:RFValue(20), overflow:"hidden",alignItems:"center",display:"flex",justifyContent:"center", marginBottom:RFValue(10), borderColor:"rgba(255,255,255,0.3)", borderWidth:0.5 },
  eventBgVertical:{ borderRadius:20, paddingHorizontal:RFValue(12), paddingBottom:RFValue(12),
    paddingTop:RFValue(32), minHeight:RFValue(138), position:"relative" },
  statusWrap:{ position:"absolute", top:RFValue(8), left:0, right:0, alignItems:"center", zIndex:2 },
  statusPill:{ minWidth:RFValue(60), paddingHorizontal:RFValue(10), paddingVertical:RFValue(2),
    borderRadius:RFValue(999), alignItems:"center", justifyContent:"center" },
  statusPillText:{ fontFamily:"PoppinsSemiBold", fontSize:RFValue(10) },
  mainRow:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", width:"100%" },
  teamCol:{width:RFValue(56), alignItems:"center" },
  teamLogo:{ width:RFValue(56), height:RFValue(56), borderRadius:999, marginBottom:RFValue(6), borderWidth:1, borderColor:"#fff" },
  teamNameBox:{ height:RFValue(16), justifyContent:"center", alignItems:"center", maxWidth:RFValue(100) },
  teamName:{ fontFamily:"PoppinsMedium", fontSize:RFValue(11), lineHeight:RFValue(14), color:"white", textAlign:"center" },
  centerCol:{ flex:1, minWidth:RFValue(140), alignItems:"center", justifyContent:"center", paddingHorizontal:RFValue(6) },
  scoreText:{ fontFamily: Platform.OS === "android" ? "monospace" : "PoppinsSemiBold",
    fontSize:RFValue(22), lineHeight:RFValue(26), color:"white",
    ...(Platform.OS === "ios" ? { fontVariant: ["tabular-nums"] } : { letterSpacing: 0.5 }),
    textAlign:"center" },
  centerMetaBox:{ marginTop:RFValue(2), height:RFValue(26), alignItems:"center", justifyContent:"space-between" },
  dateText:{ fontFamily:"Poppins", fontSize:RFValue(10), lineHeight:RFValue(12), color:"white" },
  relativeText:{ fontFamily:"PoppinsMedium", fontSize:RFValue(10), lineHeight:RFValue(12), color:"#FFD700" },
  standingsCardVertical:{ width:width*0.9, backgroundColor:"rgba(35,35,35,0.9)", borderRadius:RFValue(16),
    padding:RFValue(10), flexDirection:"row", justifyContent:"space-between", alignItems:"center",
    borderWidth:1, borderColor:"rgba(255,255,255,0.08)" },
  standingBox:{ alignItems:"center", flex:1, paddingHorizontal:RFValue(4) },
  standingTeamName:{ fontFamily:"PoppinsSemiBold", color:"white", fontSize:RFValue(12), marginBottom:RFValue(2), textAlign:"center" },
  standingText:{ fontFamily:"Poppins", color:"white", fontSize:RFValue(11), textAlign:"center", opacity:0.9 },
  vDivider:{ width:1, height:RFValue(24), backgroundColor:"rgba(255,255,255,0.08)" },
  avatarFallback:{ width:RFValue(56), height:RFValue(56), borderRadius:999, alignItems:"center", justifyContent:"center",
    borderWidth:1, borderColor:"#fff", backgroundColor:"rgba(255,215,0,0.15)" },
  avatarInitials:{ fontFamily:"PoppinsSemiBold", color:"#FFD700", fontSize:RFValue(15) },
  overlayTap:{ ...StyleSheet.absoluteFillObject },
  profileMenu:{
    position:"absolute", top:RFValue(92), right:RFValue(14),
    width:RFValue(170), borderRadius:RFValue(14), overflow:"hidden",
    backgroundColor:"rgba(30,30,30,0.9)", borderWidth:1, borderColor:"rgba(255,255,255,0.08)",
    zIndex: 5, elevation: 8
  },
  menuItem:{ flexDirection:"row", alignItems:"center", paddingVertical:RFValue(10), paddingHorizontal:RFValue(12) },
  menuIcon:{ width:RFValue(18), height:RFValue(18), tintColor:"#fff", marginRight:RFValue(8) },
  menuText:{ color:"#fff", fontFamily:"PoppinsMedium", fontSize:RFValue(14) },
  menuDivider:{ height:1, backgroundColor:"rgba(255,255,255,0.08)" },
  modalBackdrop:{ flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"center", alignItems:"center", padding:RFValue(16) },
  modalCard:{ width:"100%", maxWidth:600, maxHeight:"80%", borderRadius:RFValue(18), overflow:"hidden",
    backgroundColor:"rgba(25,25,25,0.95)", borderWidth:1, borderColor:"rgba(255,255,255,0.08)", padding:RFValue(12) },
  modalHeader:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:RFValue(6) },
  modalTitle:{ color:"#fff", fontFamily:"PoppinsBold", fontSize:RFValue(18) },
  modalClose:{ width:RFValue(32), height:RFValue(32), borderRadius:999, alignItems:"center", justifyContent:"center", backgroundColor:"rgba(255,255,255,0.08)" },
  modalCloseText:{ color:"#fff", fontSize:RFValue(16), fontFamily:"PoppinsSemiBold" },
  modalNote:{ color:"#fff", opacity:0.75, fontFamily:"Poppins", marginBottom:RFValue(6) },
  rankRow:{ flexDirection:"row", alignItems:"center", paddingVertical:RFValue(8), gap:RFValue(8) },
  rankNum:{ width:RFValue(22), textAlign:"center", color:"#fff", fontFamily:"PoppinsSemiBold" },
  trophy:{ width:RFValue(24), height:RFValue(24) },
  userAvatar:{ width:RFValue(36), height:RFValue(36), borderRadius:999, borderWidth:1, borderColor:"rgba(255,255,255,0.2)" },
  rankName:{ color:"#fff", fontFamily:"PoppinsMedium", fontSize:RFValue(13) },
  progressTrack:{ height:RFValue(6), backgroundColor:"rgba(255,255,255,0.1)", borderRadius:RFValue(999), marginTop:RFValue(4), overflow:"hidden" },
  progressBar:{ height:"100%", backgroundColor:GOLD },
});
