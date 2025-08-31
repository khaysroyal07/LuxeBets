// app/(tabs)/Dash.js — SportsDataIO feed + profile dropdown + streaks modal
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

const SDIO_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY ||
  Constants?.expoConfig?.extra?.SPORTSDATAIO_KEY ||
  "";

/* ---------- Streaks (leaderboard) config ---------- */
const STREAKS_URL =
  process.env.EXPO_PUBLIC_STREAKS_URL ||
  Constants?.expoConfig?.extra?.STREAKS_URL ||
  "";
const STREAKS_API_KEY =
  process.env.EXPO_PUBLIC_STREAKS_API_KEY ||
  Constants?.expoConfig?.extra?.STREAKS_API_KEY ||
  "";

/* ---------------- Sports config (SportsDataIO) ---------------- */
const SPORT_CONFIG = {
  nba:  { label: "NBA",  base: "https://api.sportsdata.io/v3/nba/scores/json",  gamesByDate: "GamesByDate",  teams: "Teams", standings: (s)=>`Standings/${s}`, iconUrl: "https://img.icons8.com/ios-filled/100/basketball.png" },
  wnba: { label: "WNBA", base: "https://api.sportsdata.io/v3/wnba/scores/json", gamesByDate: "GamesByDate", teams: "Teams", standings: (s)=>`Standings/${s}`, iconUrl: "https://img.icons8.com/fluency/100/basketball-2.png" },
  mlb:  { label: "MLB",  base: "https://api.sportsdata.io/v3/mlb/scores/json",  gamesByDate: "GamesByDate",  teams: "Teams", standings: (s)=>`Standings/${s}`, iconUrl: "https://img.icons8.com/ios-filled/100/baseball.png" },
  nfl:  { label: "NFL",  base: "https://api.sportsdata.io/v3/nfl/scores/json",  gamesByDate: "ScoresByDate", teams: "Teams", standings: (s)=>`Standings/${s}`, iconUrl: "https://img.icons8.com/ios-filled/100/american-football.png" },
  nhl:  { label: "NHL",  base: "https://api.sportsdata.io/v3/nhl/scores/json",  gamesByDate: "GamesByDate",  teams: "Teams", standings: (s)=>`Standings/${s}`, iconUrl: "https://img.icons8.com/ios-filled/100/ice-hockey.png" },
};
const SPORTS = Object.keys(SPORT_CONFIG);
const YEAR_OPTIONS = ["Auto", 2025, 2024, 2023, 2022];

const defaultTeamLogo =
  "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg";

/* ---------------- Theme & Utils ---------------- */
const MONTHS_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const PURPLE = "#613DC1";
const DEEP_PURPLE = "#2c0735";
const GOLD = "#FFD700";

/** 👇 Add a default tier for deep-linking into the tournaments page */
const DEFAULT_TIER = "20";

function toSDIODate(d){const y=d.getFullYear();const m=MONTHS_ABBR[d.getMonth()];const day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
function sanitizeUrl(u){if(!u)return null;try{const t=u.trim();return t.startsWith("http://")?"https://"+t.slice(7):t;}catch{return null;}}
function parseGameDate(s){if(!s)return null;const dt=new Date(s);return isNaN(dt.getTime())?null:dt;}
function statusBucket(status,dt){const now=new Date();const s=(status||"").toLowerCase();if(s.includes("inprogress")||s==="in progress"||s==="live")return "LIVE";if(s.includes("final")||s.startsWith("f/"))return "FINAL";if(dt&&dt>now)return "UPCOMING";return s==="scheduled"?"UPCOMING":"FINAL";}
function tagStyle(b){return b==="LIVE"?{bg:"#22c55e",fg:"#0a2915"}:b==="UPCOMING"?{bg:"#f59e0b",fg:"#2b1a00"}:{bg:"#6b7280",fg:"#0d1117"};}
function dedupeByGameId(list){const seen=new Set();return list.filter(g=>{const id=g.GameID||g.GameId||g.GlobalGameID||`${g.HomeTeam}-${g.AwayTeam}-${g.DateTime||g.Day}`;const s=String(id);if(seen.has(s))return false;seen.add(s);return true;});}
function relativeWhen(ms,b){if(!ms)return"";const now=Date.now();const diff=ms-now;const abs=Math.abs(diff);const min=Math.round(abs/60000);const h=Math.floor(min/60);const m=min%60;if(b==="FINAL"){if(h>=24)return`${Math.floor(h/24)}d ago`;if(h>=1)return`${h}h ago`;return`${m}m ago`;}if(diff<=0)return"now";if(h>=24)return`in ${Math.floor(h/24)}d`;if(h>=1)return`in ${h}h ${m?m+"m":""}`.trim();return`in ${m}m`;}

/* ---------------- Atoms ---------------- */
function TeamAvatar({ uri, name }) {
  const [err, setErr] = useState(false);
  const good = !err && sanitizeUrl(uri);
  if (good) return <Image source={{ uri: good }} onError={() => setErr(true)} style={styles.teamLogo} />;
  const initials=(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")||"??";
  return (<View style={styles.avatarFallback}><Text style={styles.avatarInitials}>{initials}</Text></View>);
}
function Chip({ label, selected, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.chip, selected && styles.chipSelected, style]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ---------- Player streaks helpers ---------- */
const MOCK_STREAKS = [
  { id: "1", name: "Ava King",  streak: 8, avatarUrl: "https://i.pravatar.cc/100?img=5" },
  { id: "2", name: "Noah Lee",  streak: 6, avatarUrl: "https://i.pravatar.cc/100?img=12" },
  { id: "3", name: "Maya Cruz", streak: 5, avatarUrl: "https://i.pravatar.cc/100?img=32" },
  { id: "4", name: "Owen Kim",  streak: 4, avatarUrl: "https://i.pravatar.cc/100?img=44" },
  { id: "5", name: "Liam Fox",  streak: 3, avatarUrl: "https://i.pravatar.cc/100?img=14" },
];
function trophyForRank(rank){
  if(rank===1) return { uri:"https://img.icons8.com/fluency/96/trophy.png" };
  if(rank===2) return { uri:"https://img.icons8.com/color/96/silver-medal.png" };
  if(rank===3) return { uri:"https://img.icons8.com/color/96/bronze-medal.png" };
  return null;
}

/* ---------------- Screen ---------------- */
export default function Dash(){
  const [selectedSportIndex,setSelectedSportIndex]=useState(0);
  const [selectedYear,setSelectedYear]=useState("Auto");

  // teams/standings
  const [teamsMap,setTeamsMap]=useState({});
  const [teamIdMap,setTeamIdMap]=useState({});
  const [standingsMap,setStandingsMap]=useState({});

  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(false);
  const [note,setNote]=useState("");

  const [showFilter,setShowFilter]=useState(false);
  const [quickFilter,setQuickFilter]=useState("ALL");
  const [todayOnly,setTodayOnly]=useState(false);
  const [sortMode,setSortMode]=useState("smart");

  // profile dropdown + streaks modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [streaks, setStreaks] = useState([]);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState("");

  const router=useRouter();
  const [fontsLoaded]=useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  const sportKey=SPORTS[selectedSportIndex];
  const sportCfg=SPORT_CONFIG[sportKey];
  const headers=useMemo(()=>({"Ocp-Apim-Subscription-Key":SDIO_KEY}),[]);

  // safe navigation helper: close then push on next frame
  const go = useCallback((path) => {
    setProfileOpen(false);
    requestAnimationFrame(() => router.push(path));
  }, [router]);

  /* -------- Teams (build byKey + byId maps) -------- */
  useEffect(()=>{ if(!SDIO_KEY)return; let off=false; (async()=>{
      try{
        const r=await fetch(`${sportCfg.base}/${sportCfg.teams}`,{headers});
        if(!r.ok) throw new Error(`Teams ${sportCfg.label} -> ${r.status}`);
        const data=await r.json();
        const byKey={}, byId={};
        (data||[]).forEach(t=>{
          const key=t.Key||t.Team||t.Abbreviation||t.Code;
          const id=t.TeamID ?? t.TeamId ?? t.ID;
          const name=t.Name || [t.City,t.Nickname].filter(Boolean).join(" ") || key;
          const logo=sanitizeUrl(t.WikipediaLogoUrl)||sanitizeUrl(t.TeamLogoUrl)||sanitizeUrl(t.WikipediaWordMarkUrl)||defaultTeamLogo;
          if(key){ byKey[key]={ name, logo, id }; }
          if(id!=null){ byId[id]={ name, logo, key }; }
        });
        if(!off){ setTeamsMap(byKey); setTeamIdMap(byId); }
      }catch(e){ console.warn("Teams error",sportCfg.label,e); if(!off){ setTeamsMap({}); setTeamIdMap({}); } }
    })(); return()=>{off=true}; },[sportKey]);

  /* -------- Standings -------- */
  useEffect(()=>{ if(!SDIO_KEY)return; let off=false; (async()=>{
      try{
        const season = selectedYear==="Auto"?new Date().getFullYear():Number(selectedYear);
        const r=await fetch(`${sportCfg.base}/${sportCfg.standings(season)}`,{headers});
        if(!r.ok){ console.warn("Standings HTTP",sportCfg.label,r.status); if(!off) setStandingsMap({}); return; }
        const arr=await r.json(); const map={};
        (arr||[]).forEach(row=>{
          const wins=row.Wins??row.WinsOverall??row.WinsHome??row.Wins??undefined;
          const losses=row.Losses??row.LossesOverall??row.LossesHome??row.Losses??undefined;
          const pct=row.Percentage??row.WinPercentage??(wins!=null&&losses!=null?wins/(wins+losses):undefined);
          const rec={wins,losses,pct};
          const id=row.TeamID ?? row.TeamId ?? row.ID ?? row.GlobalTeamID;
          const key=row.Key || row.Abbreviation || row.Team;
          const name=row.Name;
          const city=row.City;
          const fullName=[city,name].filter(Boolean).join(" ");
          const add=(k)=>{ if(!k) return; map[k]=rec; map[String(k).toUpperCase()]=rec; };
          if(id!=null) add(`ID:${id}`);
          add(key); add(name); add(fullName);
        });
        if(!off) setStandingsMap(map);
      }catch(e){ console.warn("Standings error",sportCfg.label,e); if(!off) setStandingsMap({}); }
    })(); return()=>{off=true}; },[sportKey,selectedYear]);

  /* -------- Fetch helpers -------- */
  async function fetchByDate(date){ const d=toSDIODate(date); const url=`${sportCfg.base}/${sportCfg.gamesByDate}/${encodeURIComponent(d)}`;
    const r=await fetch(url,{headers}); if(!r.ok) return []; const j=await r.json(); return Array.isArray(j)?j:[]; }
  async function fetchWindowSerial(center,aheadDays,backDays,stopAfter){
    const out=[]; for(let i=0;i<=aheadDays;i++){ const dt=new Date(center); dt.setDate(dt.getDate()+i); const arr=await fetchByDate(dt); out.push(...arr); if(out.length>=stopAfter)break; }
    if(out.length<stopAfter){ for(let i=1;i<=backDays;i++){ const dt=new Date(center); dt.setDate(dt.getDate()-i); const arr=await fetchByDate(dt); out.push(...arr); if(out.length>=stopAfter)break; } }
    return dedupeByGameId(out);
  }
  async function fetchYearSamples(year){
    const sample=[new Date(`${year}-01-15`),new Date(`${year}-04-15`),new Date(`${year}-08-15`),new Date(`${year}-11-15`)];
    let res=[]; for(const d of sample){ const c=await fetchWindowSerial(d,2,2,30); res=res.concat(c); if(res.length>=40)break; }
    return dedupeByGameId(res);
  }

  /* -------- Enrich games -------- */
  function enrichGames(list){
    return list.map(g=>{
      const homeId = g.HomeTeamID ?? g.HomeTeamId ?? null;
      const awayId = g.AwayTeamID ?? g.AwayTeamId ?? null;

      const hkFromId = homeId!=null && teamIdMap[homeId]?.key ? teamIdMap[homeId].key : null;
      const akFromId = awayId!=null && teamIdMap[awayId]?.key ? teamIdMap[awayId].key : null;

      const hk=g.HomeTeamName||hkFromId||g.HomeTeam||g.HomeTeamAbbreviation||g.HomeTeamKey;
      const ak=g.AwayTeamName||akFromId||g.AwayTeam||g.AwayTeamAbbreviation||g.AwayTeamKey;

      const home = (hk && teamsMap[hk]) ? teamsMap[hk] : (homeId!=null ? teamIdMap[homeId] : {name:hk,logo:defaultTeamLogo});
      const away = (ak && teamsMap[ak]) ? teamsMap[ak] : (awayId!=null ? teamIdMap[awayId] : {name:ak,logo:defaultTeamLogo});

      const dt=parseGameDate(g.DateTime||g.Day);
      const when=dt?`${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:(g.Day||"").toString().split("T")[0];
      const bucket=statusBucket(g.Status,dt);

      return {
        id:g.GameID||g.GameId||g.GlobalGameID||`${hk}-${ak}-${g.DateTime||g.Day}`,
        homeId, awayId,
        homeKey:hk, awayKey:ak,
        homeName:home?.name||hk, awayName:away?.name||ak,
        homeLogo:home?.logo||defaultTeamLogo, awayLogo:away?.logo||defaultTeamLogo,
        homeScore:g.HomeTeamScore??g.HomeScore??g.HomeTeamRuns??g.HomeTeamGoals??null,
        awayScore:g.AwayTeamScore??g.AwayScore??g.AwayTeamRuns??g.AwayTeamGoals??null,
        when, rawDate: dt?dt.getTime():0, bucket,
      };
    });
  }
  function sortEnriched(arr,mode){
    if(!Array.isArray(arr))return [];
    const A=[...arr];
    if(mode==="timeAsc") return A.sort((a,b)=>(a.rawDate||0)-(b.rawDate||0));
    if(mode==="timeDesc")return A.sort((a,b)=>(b.rawDate||0)-(a.rawDate||0));
    const score={LIVE:0,UPCOMING:1,FINAL:2};
    return A.sort((a,b)=>{
      if(score[a.bucket]!==score[b.bucket]) return score[a.bucket]-score[b.bucket];
      if(a.bucket==="FINAL"&&b.bucket==="FINAL") return (b.rawDate||0)-(a.rawDate||0);
      return (a.rawDate||0)-(b.rawDate||0);
    });
  }

  /* -------- Events -------- */
  useEffect(()=>{ if(!SDIO_KEY)return; let off=false; (async()=>{
      setLoading(true); setEvents([]); setNote("");
      try{
        const now=new Date(); let list=[];
        if(selectedYear==="Auto"){
          if(todayOnly){ const today=await fetchByDate(now); const e=enrichGames(today); if(!off){ setEvents(sortEnriched(e,sortMode)); setNote(e.length?"":"No games today."); } setLoading(false); return; }
          list=await fetchWindowSerial(now,5,0,30); let e=enrichGames(list); let up=e.filter(g=>g.bucket!=="FINAL");
          if(up.length===0){ setNote("Looking ahead for upcoming games…"); list=await fetchWindowSerial(now,14,0,50); e=enrichGames(list); up=e.filter(g=>g.bucket!=="FINAL"); }
          if(up.length===0){ setNote("No upcoming found; showing recent finals…"); list=await fetchWindowSerial(now,0,7,40); e=enrichGames(list); }
          if(!e?.length){ list=await fetchWindowSerial(now,0,21,60); e=enrichGames(list); }
          if(!e?.length){ const yr=now.getFullYear(); setNote(`Sampling ${yr}…`); list=await fetchYearSamples(yr); e=enrichGames(list); }
          if(!off) setEvents(sortEnriched(e,sortMode));
        }else{
          setNote(`Looking in ${selectedYear}…`);
          const yearList=await fetchYearSamples(Number(selectedYear)); const e=enrichGames(yearList);
          if(!off){ setEvents(sortEnriched(e,sortMode)); setNote(e.length?"":`No results in ${selectedYear}.`); }
        }
      }catch(e){ console.warn("Events error",sportCfg.label,e); if(!off){ setEvents([]); setNote("No events to show (check API key / plan)."); } }
      finally{ if(!off) setLoading(false); }
    })(); return()=>{off=true};
  // eslint-disable-next-line react-hooks/exhaustive-comments
  },[sportKey,selectedYear,todayOnly,sortMode,SDIO_KEY,sportCfg.base,teamsMap,teamIdMap]);

  const shownEvents=useMemo(()=>quickFilter==="ALL"?events:events.filter(e=>e.bucket===quickFilter),[events,quickFilter]);
  if(!fontsLoaded) return null;

  /* -------- Subcomponent to lock column alignment -------- */
  const TeamCol = ({ name, logo }) => (
    <View style={styles.teamCol}>
      <TeamAvatar uri={logo} name={name} />
      <View style={styles.teamNameBox}>
        <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
      </View>
    </View>
  );

  /* Helper to fetch correct standings for a side */
  const getStd = (item, side) => {
    const id = item[side === "home" ? "homeId" : "awayId"];
    const key = (item[side === "home" ? "homeKey" : "awayKey"] || "").toUpperCase();
    const name = item[side === "home" ? "homeName" : "awayName"];
    return (
      standingsMap[`ID:${id}`] ||
      standingsMap[key] ||
      standingsMap[name] ||
      standingsMap[(name || "").toUpperCase()] ||
      {}
    );
  };

  /* -------- Card -------- */
  const EventCard = ({ item }) => {
    const { bg, fg } = tagStyle(item.bucket);
    const homeStd = getStd(item, "home");
    const awayStd = getStd(item, "away");
    return (
      <View style={styles.eventWrapper}>
        <View style={styles.eventCardVertical}>
          <BlurView intensity={60} tint="dark" style={styles.eventBgVertical}>
            <LinearGradient
              colors={["rgba(70,7,89,0.9)","rgba(74,46,153,0.5)","rgba(46,29,91,0.8)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* centered status pill */}
            <View style={styles.statusWrap}>
              <View style={[styles.statusPill, { backgroundColor: bg }]}>
                <Text style={[styles.statusPillText, { color: fg }]} numberOfLines={1}>
                  {item.bucket}
                </Text>
              </View>
            </View>

            {/* three-column grid */}
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

        {/* standings strip */}
        <View style={styles.standingsCardVertical}>
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>{item.homeName}</Text>
            <Text style={styles.standingText} numberOfLines={1}>
              W-L: {homeStd.wins ?? "-"}-{homeStd.losses ?? "-"}{homeStd.pct!=null?` • ${(homeStd.pct*100).toFixed(1)}%`:""}
            </Text>
          </View>
          <View style={styles.vDivider} />
          <View style={styles.standingBox}>
            <Text style={styles.standingTeamName} numberOfLines={1}>{item.awayName}</Text>
            <Text style={styles.standingText} numberOfLines={1}>
              W-L: {awayStd.wins ?? "-"}-{awayStd.losses ?? "-"}{awayStd.pct!=null?` • ${(awayStd.pct*100).toFixed(1)}%`:""}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSportTab = ({ item: k, index }) => {
    const cfg = SPORT_CONFIG[k]; const selected = selectedSportIndex===index;
    return (
      <TouchableOpacity onPress={()=>{ setSelectedSportIndex(index); setSelectedYear("Auto"); setQuickFilter("ALL"); }}
        style={[styles.sportIconHorizontal, selected && { borderColor: GOLD, borderWidth: 2 }]}>
        <Image source={{ uri: cfg.iconUrl }} style={[styles.sportIconSmall, { tintColor: "#fff" }]} />
        <Text style={[styles.sportNameHorizontal, selected && { color: GOLD }]} numberOfLines={1}>{cfg.label}</Text>
      </TouchableOpacity>
    );
  };

  /* ---------- Streaks load ---------- */
  const loadStreaks = async () => {
    setStreakLoading(true);
    setStreakError("");
    try {
      let rows = [];
      if (STREAKS_URL) {
        const r = await fetch(STREAKS_URL, {
          headers: {
            "Content-Type": "application/json",
            ...(STREAKS_API_KEY ? { apikey: STREAKS_API_KEY, Authorization: `Bearer ${STREAKS_API_KEY}` } : {})
          }
        });
        if (r.ok) {
          const j = await r.json();
          rows = Array.isArray(j) ? j : (j?.streaks || []);
        }
      }
      if (!rows.length) rows = MOCK_STREAKS;
      rows.sort((a,b)=> (b.streak||0)-(a.streak||0));
      setStreaks(rows);
    } catch (e) {
      console.warn("streaks error", e);
      setStreaks(MOCK_STREAKS);
      setStreakError("Using sample data.");
    } finally {
      setStreakLoading(false);
    }
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
          {/* Standings / streaks */}
          <TouchableOpacity
            onPress={() => { setStreakOpen(true); loadStreaks(); }}
            activeOpacity={0.85}
          >
            <Image source={{ uri: "https://img.icons8.com/ios-filled/50/leaderboard.png" }} style={[styles.iconSmall, { tintColor: GOLD }]} />
          </TouchableOpacity>

          {/* Profile dropdown */}
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
              <Chip key={q} label={q} selected={quickFilter===q} onPress={()=>setQuickFilter(q)} style={{ marginBottom: RFValue(6) }} />
            ))}
          </View>

          <Text style={[styles.filterTitle,{marginTop:RFValue(8)}]}>Time</Text>
          <View style={styles.filterRow}>
            <Chip label={todayOnly ? "Today ✓" : "Today"} selected={todayOnly} onPress={()=>setTodayOnly(v=>!v)} />
          </View>

          <Text style={[styles.filterTitle,{marginTop:RFValue(8)}]}>Year</Text>
          <View style={styles.filterRow}>
            {YEAR_OPTIONS.map(y=>(
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

      {/* Profile dropdown menu (fixed layering + delayed navigation) */}
      {profileOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} pointerEvents="box-none">
          {/* Backdrop behind the menu so it doesn't block menu taps */}
          <Pressable style={styles.overlayTap} onPress={()=>setProfileOpen(false)} />
          <BlurView intensity={70} tint="dark" style={styles.profileMenu}>
            <Pressable
              style={styles.menuItem}
              onPress={() => go("/user/profile")}
            >
              <Image source={{ uri: "https://img.icons8.com/ios-glyphs/30/user--v1.png" }} style={styles.menuIcon} />
              <Text style={styles.menuText}>Profile</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => go("/user/settings")}
            >
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
              keyExtractor={(it, idx)=>String(it.id ?? idx)}
              refreshControl={
                <RefreshControl
                    refreshing={streakLoading}
                    onRefresh={loadStreaks}
                    tintColor="#fff"
                />
              }
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
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: barW }]} />
                      </View>
                    </View>
                    <Text style={styles.rankStreak}>W{item.streak}</Text>
                  </View>
                );
              }}
              ListEmptyComponent={!streakLoading ? (
                <Text style={styles.modalNote}>No players yet.</Text>
              ) : null}
              contentContainerStyle={{ paddingBottom: RFValue(8) }}
              showsVerticalScrollIndicator={false}
            />
          </BlurView>
        </View>
      </Modal>

      <FlatList
        data={shownEvents}
        keyExtractor={(item)=>String(item.id)}
        renderItem={({item})=>(
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={()=>router.push({ pathname: "/tournaments", params: { tier: DEFAULT_TIER } })}
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

/* ---------------- Styles (original colors + dropdown + modal) ---------------- */
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
    borderRadius:RFValue(12), borderWidth:1, borderColor:"rgba(255,255,255,0.2)", backgroundColor:"rgba(44,7,53,0.8)" },
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

  // Centered status pill
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

  /* Dropdown menu */
  overlayTap:{ ...StyleSheet.absoluteFillObject }, // no zIndex -> behind the menu
  profileMenu:{
    position:"absolute", top:RFValue(92), right:RFValue(14),
    width:RFValue(170), borderRadius:RFValue(14), overflow:"hidden",
    backgroundColor:"rgba(30,30,30,0.9)", borderWidth:1, borderColor:"rgba(255,255,255,0.08)",
    zIndex: 5,           // ensure above backdrop
    elevation: 8         // Android tapability
  },
  menuItem:{ flexDirection:"row", alignItems:"center", paddingVertical:RFValue(10), paddingHorizontal:RFValue(12) },
  menuIcon:{ width:RFValue(18), height:RFValue(18), tintColor:"#fff", marginRight:RFValue(8) },
  menuText:{ color:"#fff", fontFamily:"PoppinsMedium", fontSize:RFValue(14) },
  menuDivider:{ height:1, backgroundColor:"rgba(255,255,255,0.08)" },

  /* Streaks modal */
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
