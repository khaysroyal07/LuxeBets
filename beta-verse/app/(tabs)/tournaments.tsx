// app/(tabs)/tournaments/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

import EntriesModal from "../entries/EntriesModal";
import GalaxyAlert from "@/components/GalaxyAlert";

const BG = require("@/assets/images/bgDash.png");

const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.12)";
const CARD = "rgba(10,10,20,0.96)";

type TierKey = "mercury" | "mars" | "jupiter" | "saturn";

const TIERS: {
  key: TierKey;
  title: string;
  subtitle: string;
  buyInLabel: string;
}[] = [
  { key: "mercury", title: "Tournament of Mercury", subtitle: "Starter • $10 entry", buyInLabel: "$10 Entry" },
  { key: "mars", title: "Tournament of Mars", subtitle: "Beginner • $20 entry", buyInLabel: "$20 Entry" },
  { key: "jupiter", title: "Tournament of Jupiter", subtitle: "Intermediate • $50 entry", buyInLabel: "$50 Entry" },
  { key: "saturn", title: "Tournament of Saturn", subtitle: "High Roller • $100 entry", buyInLabel: "$100 Entry" },
];

type DbTournament = {
  id: string;
  tier?: string | null;
  status?: string | null;
  start_date?: string | null; // date
  end_date?: string | null; // date
  join_open_at?: string | null; // timestamptz
  join_close_at?: string | null; // timestamptz
};

type TournamentCard = {
  id: string;
  tier: TierKey;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  joinOpensAt?: string | null;
  joinClosesAt?: string | null;
  isPlaceholder?: boolean;
  joined?: boolean;
  playerCount?: number | null;
};

const SDIO_KEY = (Constants?.expoConfig?.extra as any)?.SPORTSDATAIO_KEY as string | undefined;

// Supabase can return "YYYY-MM-DD HH:mm:ss.ssssss+00" which RN Date parsing can fail on.
// Normalize to ISO by replacing the first space with "T".
const parseSupabaseTs = (value?: string | null): Date | null => {
  if (!value) return null;
  const isoLike = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(isoLike);
  return isNaN(d.getTime()) ? null : d;
};

const formatShort = (value?: string | null): string | null => {
  const d = parseSupabaseTs(value);
  if (!d) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatPlayers = (n?: number | null) => {
  if (n === null || n === undefined) return "—";
  if (n === 1) return "1 player";
  return `${n} players`;
};

const RULES_TEXT = `Rules & Points

What is Premnix?
Premnix is a 6-day tournament challenge where strategy meets competition and every day counts. Players make daily picks across multiple games, earning points based on accuracy and strategy. With each correct choice, you climb the leaderboard, competing against others for a shot at the ultimate grand prize at the end of each tournament.

Rules
In addition to our Terms of Use and Privacy Policy, contests at Premnix are governed by the following set of rules:

Eligibility
You must be 18 years of age (21 years of age or older in Massachusetts, Louisiana & Arizona, 19 years of age or older in Alabama) or over as well as a resident of AND physically located in the USA or Canada to make a deposit or play in any Premnix contest with an entry fee or prize. If you are physically located in Louisiana, eligibility varies by parish. If you are physically located in Hawaii, Connecticut, Idaho, Montana, Nevada, Washington, Puerto Rico or Ontario (Canada), you may enter free contests but cannot deposit funds or enter any contests requiring an entry fee. For further information regarding eligibility, please consult our official Terms of Use. 

Multiple Accounts
Each player on Premnix may only maintain and use one account and "multi-accounting" is expressly prohibited. If Premnix determines that you have opened, maintained, used or controlled more than one account, any or all of your accounts may be terminated or suspended and any prizes you've won may be revoked or withheld.

Suspended Accounts
There are a variety of behaviors that are detrimental to Premnix and other players on the Service. Engaging in those behaviors may result in suspension of some or all functions associated with your account immediately, without prior notice or liability. Suspended players are expected to respect the disciplinary actions imposed on their accounts and all communication regarding restoration of your account should take place via the [support email] email account.

User Names
Premnix may require users to change their user names in cases where the name is offensive or promotes a commercial venture. The requirement to change will be determined at Premnix’s sole discretion, and if requests are ignored, Premnix may unilaterally change a player’s user name.

Experience Levels
tbd

Unfilled Contests
All open contests that are completed on Premnix have a predetermined minimum prize pool and number of entrants. If that number of participants is not reached before the start of the contest, the contest will not take place and your entrance fee will be refunded. For example, if the $20 entrance fee for the tournament of mars only reaches a total of 3 participants and $60, the prize pool will only reach a total of $45 after the hosting fees are taken out and in turn, the tournament will be cancelled. Premnix reserves the right to cancel contests in its sole discretion.

Contest Lock Times
Tournaments will open every Sunday and lock every Tuesday 30 minutes before the first game starts for the slate of games associated with that tournament week, meaning no more entries will be accepted until the following Sunday for a new tournament. Premnix reserves the right to push back or push forward the start time of a tournament.

Canceling Entries
Users may cancel entries by clicking on the 'Cancel Entry' link located [location description]. 
You will not be able to cancel an entry within 15 minutes to the start of the game.
Premnix has no obligation to honor cancellation requests that are not received, or which are received after the deadlines, due to technical difficulties or other reasons.

Postponed and Suspended Games
Rules for how postponed or suspended games are treated in Premnix contests vary depending on the date and time of postponement. If a game that a player has bet on is postponed, the player is eligible for a full refund if there is no more games to bet on for the day or if the tournament is in its late phases (day 3 through 6). If the tournament is in the late phases and the player has a favorable amount of points, the player has the choice of taking half the points they would have gotten from their original bet.

A game is considered postponed or suspended if it is unfinished, but scheduled to be completed at a future date.

Please note that a game will be considered to be 'complete' on a given day if it begins on that day and is completed no later than 24 hours from its start. After the game is finished/completed, you will receive points based on your choice of play.

Withdrawals
You can withdraw your money at any time, subject to anti-fraud checks on deposits and playing patterns prior to processing. For all withdrawals we require a valid mailing address, birthday and social security number in order to file the appropriate tax forms at year end. To withdraw, simply click the Withdraw link in the wallet of your Premnix account on the app. Enter the amount you wish to withdraw, along with any of the necessary information needed. PayPal requests will be processed within 48 hours, while check withdrawals generally take 7-10 days to process. We conduct anti-fraud checks on playing patterns and deposits prior to processing a withdrawal.
In cases where you have received a discount or other benefits as a result of signing up or any other deals available and have not yet played through the deposit (entering contests whose total entry fees equal the value of the deposit or a percentage off of the entry fees), Premnix reserves the right to refuse the withdrawal and/or close your account.

Deposits
You may deposit into your account using the payment methods displayed on the deposit page, including Visa, Mastercard, Discover, or PayPal (American Express can be used via PayPal). If you're having any problems depositing money then get in touch and we'll help you out. There may be limits on the amount you may deposit in certain circumstances.
In accordance with state requirements, Premnix restricts deposits in any calendar month for residents of certain states unless the user has requested and received approval for an increase. For Massachusetts residents the deposit limit level is $1,000 per calendar month. For people located in Tennessee, the deposit limit level is $2,500 per calendar month. For people located in Maryland, the deposit limit level is $5,000 per calendar month.

Contest Settlement and Payment
We try to settle tournaments and run payments as quickly as possible, but must ensure we do so accurately. Most tournaments are settled shortly after the last game finishes. However, to settle we have to wait until all the game statistics have been reported by our third-party stats provider to ensure that the final box scores are complete. Please note there can sometimes be last minute changes. If there is difficulty obtaining official results or issues with scoring, the contest may be settled the following day. If multiple users tie with the same final score, the denoted prizes will be split evenly amongst all the tied users.

Service Access and Editing Problems
While we try to ensure that Premnix is functioning smoothly at all times, like any online service we may periodically experience periods of slow performance or outage. These can sometimes result in an inability to access the Service or problems creating new tournaments. If you're unable to access the Service, please report the problems by emailing us at [Email]. If there are sustained periods where players are unable to access Service functionality, or otherwise prevented from editing picks, or in certain other situations, we may provide instructions on how to cancel your entries over email prior to game time. 

Contest Cancellation
Premnix also reserves the right to cancel contests at our discretion, without any restrictions. This would typically be done only in cases where we believe that due to problems on the Service or events impacting the sporting events, there would be a widespread impact on the integrity of contests.

Premnix Picks
Premnix Picks Account Guidelines
You must have a verified premnix account to play premnix tournaments. If you have an existing Premnix account, simply login to play.
New customers must create a Premnix account and agree to the Terms of Use and Privacy Policy to play. Learn more about creating an account and verifying your identity.

How old do I need to be to play Premnix?
You must be at least eighteen (18) years of age to open an account, participate in contests, or win prizes offered on Premnix. You must be at least nineteen (19) years of age at the time of account creation if you are a legal resident of Alabama, or at least twenty-one (21) years of age if you are a legal resident of Arizona, Louisiana, or Massachusetts.

Premnix Rules & Scoring
Point System:
￼

Point Multiplier/Increase
￼

How to submit choices (entry fees)

How are Prizes Determined?
Premnix contest entries are scored based on the number of correct selections made by participants. 
Prizes are determined like so: 
Prize Pool Distribution – The prize pool is given based on the amount of points and correct picks from the top ranking participant. The earning of 20 or more total points over the 6 day course will amount to a user winning the entire prize amount. Half of the 20 point goal will win half of the total prize. Less than half of the total amount will win 25%. If the top ranked participant is tied in points with other participants, the prize pool that is earned will be split evenly amongst all the tied users. 
Any money that is not claimed or earned by the end of the tournament will be used to increase the prize poole of the next weekly tournament and/or also used to host a bi-weekly tournament special that will be as low as 1$ for the opportunity to earn more! Top 3 players will win.
For example: 2 participants finish the tournament both with 16 points. As the points are less than 20, in a $2000 prize pool tournament, $1000 will be the final prize. As 2 participants are tied with 16 points, they will each receive $500. On the contrary, A single user being the top ranked participant with 16 points will see a reward of $1000. 

Free Tournament Opportunity
There will be a chance to join a tournament for free weekly ($10 - $20 tournament only). Guess the code by guessing the top 3 players of the week with the top 3 best plays in the previous week. (Hints: the code will be the player’s 1st & last name combined in all caps. The codes will be 3 of the players who made the top play of the previous week or had the best week statistically the week before. The players will never be chosen 2 weeks in a row regardless if they have 2 great plays in back to back weeks. Example Password: JAYDENDANIELS). You will have until the time that the tournaments open to the tournaments close. Codes can only be used once so once JAYDENDANIELS is taken, please guess the next player code that would be available. 

The tournament is 6 days (Tuesday-Sunday). New tournaments open and are availble to join for 3 days (Sunday-Tuesday). They can join every tournament in one week if they want to or just join one. & can u rephrase the questions about the picks they can make?`;



export default function TournamentsScreen() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentCard[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [userId, setUserId] = useState<string | null>(null);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TournamentCard | null>(null);

  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) setUserId(data.user.id);
      } catch (e) {
        console.log("getUser error", e);
      }
    })();
  }, []);

  const isJoinWindowOpen = useCallback((t: TournamentCard) => {
    const now = new Date();
    const opens = parseSupabaseTs(t.joinOpensAt);
    const closes = parseSupabaseTs(t.joinClosesAt);
    const status = (t.status || "").toLowerCase();

    if (status !== "active") return false;
    if (!opens || !closes) return false;

    return opens <= now && now <= closes;
  }, []);

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,tier,status,start_date,end_date,join_open_at,join_close_at")
        .order("start_date", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as DbTournament[];
      const now = new Date();

      const normalized: TournamentCard[] = rows
        .map((row) => {
          const tierKey = ((row.tier || "") as string).toLowerCase() as TierKey;
          if (!["mercury", "mars", "jupiter", "saturn"].includes(tierKey)) return null;

          return {
            id: row.id,
            tier: tierKey,
            status: row.status || "active",
            startDate: row.start_date ?? null,
            endDate: row.end_date ?? null,
            joinOpensAt: row.join_open_at ?? null,
            joinClosesAt: row.join_close_at ?? null,
            isPlaceholder: false,
            playerCount: null,
          } as TournamentCard;
        })
        .filter(Boolean) as TournamentCard[];

      // pick 1 per tier: nearest upcoming else most recent past
      const mergedBase: TournamentCard[] = TIERS.map((tierMeta) => {
        const tierRows = normalized.filter((t) => t.tier === tierMeta.key);

        if (tierRows.length === 0) {
          return {
            id: `placeholder-${tierMeta.key}`,
            tier: tierMeta.key,
            status: "locked",
            isPlaceholder: true,
            playerCount: null,
          };
        }

        const withStart = tierRows.map((t) => ({
          ...t,
          _start: t.startDate ? new Date(t.startDate) : null, // date-only is safe
        }));

        const upcoming = withStart
          .filter((t) => t._start && t._start >= now)
          .sort((a, b) => a._start!.getTime() - b._start!.getTime());

        if (upcoming.length > 0) {
          const chosen = upcoming[0];
          const { _start, ...rest } = chosen as any;
          return rest;
        }

        const past = withStart
          .filter((t) => t._start && t._start < now)
          .sort((a, b) => b._start!.getTime() - a._start!.getTime());

        if (past.length > 0) {
          const chosen = past[0];
          const { _start, ...rest } = chosen as any;
          return rest;
        }

        return tierRows[0];
      });

      const realTournamentIds = mergedBase.filter((t) => !t.isPlaceholder).map((t) => t.id);

      // ✅ FIX: accurate player counts via SECURITY DEFINER RPC (bypasses RLS safely)
      const countsMap = new Map<string, number>();
      if (realTournamentIds.length > 0) {
        const { data: countRows, error: countErr } = await supabase.rpc(
          "get_tournament_player_counts",
          { p_tournament_ids: realTournamentIds }
        );

        if (countErr) {
          console.warn("player counts rpc error", countErr);
        } else {
          (countRows ?? []).forEach((r: any) => {
            countsMap.set(String(r.tournament_id), Number(r.player_count ?? 0));
          });
        }

        // ensure ids with 0 still show 0
        realTournamentIds.forEach((tid) => {
          if (!countsMap.has(tid)) countsMap.set(tid, 0);
        });
      }

      // joined flags
      if (userId && realTournamentIds.length > 0) {
        const { data: entryRows, error: entryErr } = await supabase
          .from("entries")
          .select("tournament_id")
          .eq("user_id", userId)
          .in("tournament_id", realTournamentIds);

        if (entryErr) throw entryErr;

        const joinedSet = new Set((entryRows ?? []).map((row: any) => String(row.tournament_id)));

        setTournaments(
          mergedBase.map((t) => {
            if (t.isPlaceholder) return t;
            const joined = joinedSet.has(t.id);
            const playerCount = countsMap.get(t.id) ?? 0;
            return joined ? { ...t, joined: true, playerCount } : { ...t, playerCount };
          })
        );
        return;
      }

      // no user
      setTournaments(
        mergedBase.map((t) => (t.isPlaceholder ? t : { ...t, playerCount: countsMap.get(t.id) ?? 0 }))
      );
    } catch (err) {
      console.error("tournament fetch error", err);
      Alert.alert("Error", "Unable to load tournaments right now.");

      setTournaments((prev) => {
        if (prev.length > 0) return prev;
        return TIERS.map((tierMeta) => ({
          id: `placeholder-${tierMeta.key}`,
          tier: tierMeta.key,
          status: "locked" as const,
          isPlaceholder: true,
          playerCount: null,
        }));
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTournaments();
  }, [loadTournaments]);

  // ✅ OPTIONAL: realtime player count updates (no refresh needed)
  useEffect(() => {
    const ids = tournaments.filter((t) => !t.isPlaceholder).map((t) => t.id);
    if (ids.length === 0) return;

    const channel = supabase
      .channel("tournament-player-counts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "entries" },
        (payload) => {
          const tid = String((payload.new as any)?.tournament_id ?? "");
          if (!tid || !ids.includes(tid)) return;

          setTournaments((prev) =>
            prev.map((t) => {
              if (t.id !== tid) return t;
              const next = (t.playerCount ?? 0) + 1;
              return { ...t, playerCount: next };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "entries" },
        (payload) => {
          const tid = String((payload.old as any)?.tournament_id ?? "");
          if (!tid || !ids.includes(tid)) return;

          setTournaments((prev) =>
            prev.map((t) => {
              if (t.id !== tid) return t;
              const next = Math.max(0, (t.playerCount ?? 0) - 1);
              return { ...t, playerCount: next };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournaments]);

  const handlePressTournament = (item: TournamentCard) => {
    if (item.isPlaceholder) return;

    if (item.joined) {
      router.push("/entries");
      return;
    }

    // ✅ enforce DB join window here
    if (!isJoinWindowOpen(item)) {
      Alert.alert("Join window closed", "This tournament is not accepting new entries right now.");
      return;
    }

    setSelectedTournament(item);
    setShowJoinModal(true);
  };

  const renderTournament = ({ item }: { item: TournamentCard }) => {
    const tierMeta = TIERS.find((t) => t.key === item.tier)!;
    const isJoined = !!item.joined;

    // date labels
    const startStr = formatShort(item.startDate ?? item.joinOpensAt);
    const endStr = formatShort(item.endDate ?? item.joinClosesAt);

    let weekLabel: string | null = null;
    if (startStr && endStr && startStr !== endStr) weekLabel = `Tournament: ${startStr} – ${endStr}`;
    else if (startStr) weekLabel = `Tournament starts ${startStr}`;

    const canJoin = isJoinWindowOpen(item);
    const joinLabel = canJoin ? "Join anytime before lock" : "Join window closed";

    const badgeText = isJoined ? "Joined" : canJoin ? "Open" : "Locked";
    const buttonLabel = isJoined ? "Joined" : "Enter Now";
    const buttonDisabled = isJoined || !canJoin;

    const playersText = formatPlayers(item.playerCount);

    return (
      <TouchableOpacity
        activeOpacity={buttonDisabled ? 1 : 0.85}
        onPress={() => handlePressTournament(item)}
        style={styles.cardWrapper}
      >
        <View style={styles.card}>
          <LinearGradient
            colors={["rgba(255,215,0,0.12)", "rgba(97,61,193,0.5)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardInner}
          >
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1, paddingRight: RFValue(10) }}>
                <Text style={styles.cardTitle}>{tierMeta.title}</Text>
                <Text style={styles.cardSubtitle}>{tierMeta.subtitle}</Text>

                <Text style={styles.playersLine}>
                  <Ionicons name="people-outline" size={12} color="rgba(255,255,255,0.75)" />{" "}
                  <Text style={styles.playersLineText}>{playersText}</Text>
                </Text>

                {weekLabel && <Text style={styles.weekLabel}>{weekLabel}</Text>}
                <Text style={styles.joinLabel}>{joinLabel}</Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <View style={styles.badge}>
                  <Ionicons
                    name={canJoin ? "trophy" : "lock-closed"}
                    size={16}
                    color={GOLD}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.badgeTxt}>{badgeText}</Text>
                </View>

                <View style={styles.playersBadge}>
                  <Ionicons
                    name="people"
                    size={14}
                    color="rgba(255,255,255,0.9)"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.playersBadgeTxt}>
                    {item.playerCount === null || item.playerCount === undefined ? "—" : item.playerCount}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.cardFooterRow}>
              <View>
                <Text style={styles.metaLabel}>Goal</Text>
                <Text style={styles.metaValue}>20 pts wins all</Text>
              </View>

              <TouchableOpacity
                disabled={buttonDisabled}
                activeOpacity={buttonDisabled ? 1 : 0.85}
                onPress={() => handlePressTournament(item)}
                style={[
                  styles.actionBtn,
                  buttonDisabled && styles.actionBtnDisabled,
                  isJoined && styles.actionBtnJoined,
                ]}
              >
                <Text
                  style={[
                    styles.actionBtnTxt,
                    (buttonDisabled || isJoined) && styles.actionBtnTxtDisabled,
                  ]}
                >
                  {buttonLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedTierMeta = useMemo(() => {
    if (!selectedTournament) return undefined;
    return TIERS.find((t) => t.key === selectedTournament.tier);
  }, [selectedTournament]);

  const selectedWeekLabel = useMemo(() => {
    if (!selectedTournament) return null;
    const s = formatShort(selectedTournament.startDate);
    const e = formatShort(selectedTournament.endDate);
    if (s && e && s !== e) return `Tournament: ${s} – ${e}`;
    if (s) return `Tournament starts ${s}`;
    return null;
  }, [selectedTournament]);

  return (
    <ImageBackground source={BG} style={styles.bgImage} resizeMode="cover">
      <View style={styles.overlay}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Available Tournaments</Text>
            <Text style={styles.headerSub}>Open Sunday–Tuesday · Run Tuesday–Sunday</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setShowRules(true)}
              style={[styles.infoBtn, { marginRight: RFValue(10) }]}
            >
              <Ionicons name="book-outline" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (!SDIO_KEY) {
                  Alert.alert("Sports Feed", "SportsDataIO key is not set. Live games will be hidden.");
                } else {
                  Alert.alert("Sports Feed", "Live game data is powered by SportsDataIO.");
                }
              }}
              style={styles.infoBtn}
            >
              <Ionicons name="information-circle-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <LinearGradient
          colors={["rgba(0,0,0,0.45)", "rgba(97,61,193,0.45)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.timerBanner}
        >
          <View>
            <Text style={styles.bannerTitle}>Join Sunday–Tuesday • Lock before Tuesday games</Text>
            <Text style={styles.bannerSub}>Compete for 6 days (Tuesday–Sunday).</Text>
          </View>
        </LinearGradient>

        <View style={styles.menuRow}>
          <TouchableOpacity style={styles.menuBtn} activeOpacity={0.9} onPress={() => router.push("/entries")}>
            <Ionicons name="receipt-outline" size={16} color={GOLD} style={styles.menuIcon} />
            <Text style={styles.menuTxt}>Current Entries</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuBtn}
            activeOpacity={0.9}
            onPress={() => router.push("/tournaments/TournamentHistory")}
          >
            <Ionicons name="time-outline" size={16} color={GOLD} style={styles.menuIcon} />
            <Text style={styles.menuTxt}>Tournament History</Text>
          </TouchableOpacity>
        </View>

        {loading && tournaments.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={GOLD} />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={tournaments}
            keyExtractor={(item) => item.id}
            renderItem={renderTournament}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}

        {/* JOIN MODAL */}
        <Modal
          visible={showJoinModal && !!selectedTournament}
          transparent
          animationType="slide"
          onRequestClose={() => setShowJoinModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              {selectedTournament && (
                <EntriesModal
                  tournamentId={selectedTournament.id}
                  userId={userId ?? ""}
                  tournamentTitle={selectedTierMeta?.title ?? "Tournament entry"}
                  tournamentSubtitle={selectedTierMeta?.subtitle ?? ""}
                  entryLabel={selectedTierMeta?.buyInLabel ?? undefined}
                  weekLabel={selectedWeekLabel}
                  joinLabel="Join anytime before lock"
                  onClose={() => setShowJoinModal(false)}
                  onJoined={() => {
                    setShowJoinModal(false);
                    setSelectedTournament(null);
                    loadTournaments();
                    setShowSuccessAlert(true);
                  }}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* RULES MODAL */}
        <Modal
          visible={showRules}
          transparent
          animationType="slide"
          onRequestClose={() => setShowRules(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.rulesCard}>
              <View style={styles.rulesHeader}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="book" size={18} color={GOLD} style={{ marginRight: RFValue(8) }} />
                  <Text style={styles.rulesTitle}>Rules & Points</Text>
                </View>

                <TouchableOpacity onPress={() => setShowRules(false)} style={styles.rulesCloseBtn}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.rulesDivider} />

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: RFValue(8) }}>
                <Text style={styles.rulesBody}>{RULES_TEXT}</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* SUCCESS ALERT */}
        <GalaxyAlert
          visible={showSuccessAlert}
          title="You're In! 🚀"
          message="You successfully joined the tournament. View it under Current Entries."
          buttonText="Awesome"
          onClose={() => {
            setShowSuccessAlert(false);
            router.push("/entries");
          }}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bgImage: { flex: 1, backgroundColor: "#05010A" },
  overlay: {
    flex: 1,
    paddingTop: RFValue(60),
    paddingHorizontal: RFValue(18),
    backgroundColor: "rgba(0, 0, 0, 0.09)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: RFValue(14),
  },
  headerTitle: { color: "#fff", fontSize: RFValue(18), fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: RFValue(11), marginTop: 2 },
  infoBtn: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(15),
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,20,0.8)",
  },
  timerBanner: {
    borderRadius: RFValue(16),
    paddingVertical: RFValue(8),
    paddingHorizontal: RFValue(12),
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: RFValue(10),
  },
  bannerTitle: { color: GOLD, fontSize: RFValue(11), fontWeight: "700" },
  bannerSub: { color: "rgba(255,255,255,0.75)", fontSize: RFValue(10), marginTop: 2 },
  menuRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: RFValue(14) },
  menuBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: RFValue(4),
    paddingVertical: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(10,10,20,0.9)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  menuIcon: { marginRight: RFValue(6) },
  menuTxt: { color: "#fff", fontSize: RFValue(11), fontWeight: "700" },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: RFValue(120) },
  cardWrapper: { marginBottom: RFValue(12) },
  card: {
    backgroundColor: CARD,
    borderRadius: RFValue(18),
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardInner: { paddingVertical: RFValue(14), paddingHorizontal: RFValue(14) },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: RFValue(10),
  },
  cardTitle: { color: "#fff", fontSize: RFValue(14), fontWeight: "800" },
  cardSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: RFValue(11), marginTop: 2 },
  playersLine: { marginTop: RFValue(6) },
  playersLineText: { color: "rgba(255,255,255,0.75)", fontSize: RFValue(10), fontWeight: "700" },
  weekLabel: { color: "rgba(255,255,255,0.75)", fontSize: RFValue(10), marginTop: 4 },
  joinLabel: { color: "rgba(255,255,255,0.6)", fontSize: RFValue(9), marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(4),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
  },
  badgeTxt: { color: GOLD, fontSize: RFValue(10), fontWeight: "700" },
  playersBadge: {
    marginTop: RFValue(8),
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(10),
    paddingVertical: RFValue(5),
    borderRadius: RFValue(999),
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  playersBadgeTxt: { color: "rgba(255,255,255,0.92)", fontSize: RFValue(10), fontWeight: "800" },
  cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaLabel: { color: "rgba(255,255,255,0.7)", fontSize: RFValue(10) },
  metaValue: { color: "#fff", fontSize: RFValue(11), fontWeight: "700", marginTop: 2 },
  actionBtn: {
    paddingHorizontal: RFValue(16),
    paddingVertical: RFValue(8),
    borderRadius: RFValue(999),
    backgroundColor: GOLD,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: BORDER,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnJoined: { backgroundColor: "rgba(255,215,0,0.15)" },
  actionBtnTxt: { color: "#000", fontSize: RFValue(11), fontWeight: "800" },
  actionBtnTxtDisabled: { color: "rgba(255,255,255,0.85)" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: RFValue(16),
  },
  modalCard: {
    width: "100%",
    borderRadius: RFValue(18),
    backgroundColor: "rgba(10,10,20,0.98)",
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(16),
  },
  rulesCard: {
    width: "100%",
    maxHeight: "85%",
    borderRadius: RFValue(18),
    backgroundColor: "rgba(10,10,20,0.98)",
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(14),
  },
  rulesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rulesTitle: { color: "#fff", fontSize: RFValue(14), fontWeight: "900" },
  rulesCloseBtn: {
    width: RFValue(30),
    height: RFValue(30),
    borderRadius: RFValue(15),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  rulesDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: RFValue(10) },
  rulesBody: { color: "rgba(255,255,255,0.78)", fontSize: RFValue(10), lineHeight: RFValue(15) },
});
