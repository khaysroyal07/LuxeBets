import React, { useState, useEffect } from "react";
import {
  ScrollView,
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  ImageBackground,
  Text,
  ActivityIndicator,
  Dimensions,
  FlatList,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";

const { width } = Dimensions.get("window");

const sportsIcons = [
  { id: "4391", icon: require("@/assets/icons/helmet.png"), name: "NFL" },
  { id: "4387", icon: require("@/assets/icons/basketball.png"), name: "NBA" },
  { id: "4424", icon: require("@/assets/icons/baseball.png"), name: "MLB" },
  { id: "4335", icon: require("@/assets/icons/soccer.png"), name: "EPL" },
  { id: "4444", icon: require("@/assets/icons/boxing.png"), name: "Boxing" },
  { id: "4480", icon: require("@/assets/icons/tennis.png"), name: "Tennis" },
  { id: "4390", icon: require("@/assets/icons/car.png"), name: "Nascar" },
];

export default function Dash() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  useEffect(() => {
    if (!sportsIcons[selectedIndex]) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${sportsIcons[selectedIndex].id}`
        );
        const data = await res.json();
        setEvents(data.events || []);
      } catch (error) {
        console.error("Error fetching events:", error);
        setEvents([]);
      }
      setLoading(false);
    };

    fetchEvents();
  }, [selectedIndex]);

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/bgDash.png")}
      resizeMode="cover"
      style={styles.container}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Image
          source={require("@/assets/icons/Menu.png")}
          style={styles.iconSmall}
          resizeMode="contain"
        />
        <View style={styles.topBarRight}>
          <Image
            source={require("@/assets/icons/Search.png")}
            style={styles.iconSmall}
            resizeMode="contain"
          />
          <View style={styles.profileBorder}>
            <Image
              source={require("@/assets/icons/Profile.png")}
              style={styles.profileIcon}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>

      {/* Sports Selector */}
      <ScrollView
        style={styles.sportsSelector}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: RFValue(10) }}
      >
        {sportsIcons.map((sport, index) => (
          <TouchableOpacity
            key={sport.id}
            onPress={() => setSelectedIndex(index)}
            style={[
              styles.sportIconWrapper,
              selectedIndex === index && styles.selectedSportIconWrapper,
            ]}
          >
            <Image source={sport.icon} style={styles.sportIcon} />
            <Text
              style={[
                styles.sportName,
                selectedIndex === index && styles.sportNameSelected,
              ]}
            >
              {sport.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Separator */}
      <LinearGradient
        colors={["#2C0735", "#478299"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.separator}
      />

      {/* Events Carousel */}
      <View style={styles.eventsContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#613DC1" />
        ) : events.length === 0 ? (
          <Text style={styles.noEventsText}>No upcoming matches found.</Text>
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.idEvent}
            horizontal
            pagingEnabled
            snapToAlignment="center"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.carouselItem}>
                <TouchableOpacity
                  style={styles.eventCard}
                  onPress={() =>
                    router.push({
                      pathname: "/tournament",
                      params: { eventId: item.idEvent },
                    })
                  }
                  activeOpacity={0.9}
                >
                  <ImageBackground
                    source={require("@/assets/images/liveb.png")}
                    style={styles.eventBg}
                    imageStyle={{ borderRadius: RFValue(16) }}
                  >
                    {/* Left Team */}
                    <View style={styles.teamContainer}>
                      <View style={styles.teamCircle}></View>
                      <Text style={styles.teamName} numberOfLines={2}>
                        {item.strHomeTeam}
                      </Text>
                    </View>

                    {/* Score & Info */}
                    <View style={styles.scoreContainer}>
                      {item.strStatus === "Live" && (
                        <View style={styles.liveTag}>
                          <View style={styles.liveDot}></View>
                          <Text style={styles.liveText}>LIVE</Text>
                        </View>
                      )}
                      <Text style={styles.scoreText}>
                        {item.intHomeScore ?? "-"} - {item.intAwayScore ?? "-"}
                      </Text>
                      <Text style={styles.dateText}>{item.dateEvent}</Text>
                    </View>

                    {/* Right Team */}
                    <View style={styles.teamContainer}>
                      <View style={styles.teamCircle}></View>
                      <Text style={styles.teamName} numberOfLines={2}>
                        {item.strAwayTeam}
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      {/* Upcoming Section */}
      <View style={styles.upcomingSection}>
        <Text style={styles.upcomingTitle}>Upcoming</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", height: "100%" },
  topBar: {
    flexDirection: "row",
    paddingHorizontal: RFValue(16),
    alignItems: "center",
    marginBottom: RFValue(25),
    paddingTop: RFValue(48),
  },
  iconSmall: { width: RFValue(24), height: RFValue(24) },
  topBarRight: {
    flexDirection: "row",
    marginLeft: "auto",
    alignItems: "center",
    gap: RFValue(14),
  },
  profileBorder: {
    padding: RFValue(6),
    borderWidth: 1,
    borderColor: "#613DC1",
    borderRadius: RFValue(8),
  },
  profileIcon: { width: RFValue(33), height: RFValue(30) },
  sportsSelector: { maxHeight: RFValue(80), marginBottom: RFValue(20) },
  sportIconWrapper: {
    alignItems: "center",
    marginHorizontal: RFValue(8),
    paddingVertical: RFValue(4),
    paddingHorizontal: RFValue(8),
    borderRadius: RFValue(12),
    backgroundColor: "#f5f5f5",
  },
  selectedSportIconWrapper: { backgroundColor: "#2c91a1" },
  sportIcon: {
    width: RFValue(40),
    height: RFValue(40),
    marginBottom: RFValue(4),
  },
  sportName: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(13),
    color: "#555",
  },
  sportNameSelected: { color: "white", fontWeight: "700" },
  separator: {
    height: RFValue(4),
    marginBottom: RFValue(30),
    marginHorizontal: RFValue(10),
    borderRadius: RFValue(8),
  },
  eventsContainer: { minHeight: RFValue(200), marginBottom: RFValue(20) },
  noEventsText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(16),
    color: "#2C0735",
    textAlign: "center",
  },
  carouselItem: { width, alignItems: "center", justifyContent: "center" },
  eventCard: {
    width: width * 0.88,
    height: RFValue(180),
    borderRadius: RFValue(16),
    overflow: "hidden",
  },
  eventBg: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: RFValue(10),
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamContainer: {
    flex: 1,
    alignItems: "center",
    maxWidth: RFValue(80),
  },
  teamCircle: {
    backgroundColor: "#D9D9D9",
    borderRadius: 999,
    width: RFValue(60),
    height: RFValue(60),
  },
  teamName: {
    marginTop: RFValue(6),
    fontFamily: "Poppins",
    fontSize: RFValue(12),
    color: "white",
    textAlign: "center",
  },
  scoreContainer: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    paddingHorizontal: RFValue(6),
  },
  liveTag: {
    flexDirection: "row",
    backgroundColor: "#613DC1",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: RFValue(6),
    height: RFValue(22),
    borderRadius: RFValue(11),
    marginBottom: RFValue(4),
    gap: RFValue(4),
  },
  liveDot: {
    width: RFValue(6),
    height: RFValue(6),
    backgroundColor: "#97DFFC",
    borderRadius: RFValue(3),
  },
  liveText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(11),
    color: "white",
  },
  scoreText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(20),
    color: "white",
  },
  dateText: {
    fontFamily: "Poppins",
    fontSize: RFValue(10),
    color: "white",
    marginTop: RFValue(2),
  },
  upcomingSection: { paddingHorizontal: RFValue(18) },
  upcomingTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(20),
    color: "#2C0735",
  },
});
