import React, { useState } from "react";
import {
  ScrollView,
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  ImageBackground,
  Text,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from "expo-font";

const sportsIcons = [
  require("@/assets/icons/helmet.png"),
  require("@/assets/icons/basketball.png"),
  require("@/assets/icons/baseball.png"),
  require("@/assets/icons/soccer.png"),
  require("@/assets/icons/boxing.png"),
  require("@/assets/icons/tennis.png"),
  require("@/assets/icons/car.png"),

];

export default function Dash() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <ScrollView style={styles.dash_container}>
      <View style={styles.top_bar}>
        <View>
          <Image source={require('@/assets/icons/menu.png')} style={styles.top_baric_one} resizeMode="contain" />
        </View>
        <View style={styles.right_group}>
          <Image source={require('@/assets/icons/search.png')} style={styles.top_baric_two} resizeMode="contain" />
          <View style={styles.profile_border}>
            <Image source={require('@/assets/icons/profile.png')} style={styles.top_baric_thr} resizeMode="contain" />
          </View>
        </View>
      </View>
      <ScrollView style={styles.hmenu_cont} horizontal showsHorizontalScrollIndicator={false}>
        {sportsIcons.map((icon, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => setSelectedIndex(index)}
            style={styles.iconWrapper}
          >
            <View style={[styles.iconInner, selectedIndex === index && styles.selectedIcon]}>
              <Image source={icon} style={styles.iconImage} resizeMode="contain" />
            </View>
          </TouchableOpacity>

        ))}

      </ScrollView>

      <View style={styles.dash_cont_two}>
        <LinearGradient
          colors={['#2C0735', '#478299']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.line_gradient}
        />
        <ImageBackground
          resizeMode="cover"
          style={styles.live_cont}
          source={require('@/assets/images/livebox.png')}>
          <View style={styles.live_col_one}>
            <View style={styles.live_circle}></View>
            <Text style={{ marginTop: 10, fontFamily: 'Poppins', fontSize: RFValue(15), color: 'white' }}>Team {'\n'}Name</Text >
          </View>
          <View style={styles.live_col_two}>
            <View style={styles.live_tag}>
              <View style={styles.sm_circle}></View>
              <Text style={{ fontFamily: 'PoppinsSemiBold', fontSize: RFValue(15), color: 'white' }}>LIVE</Text>
            </View>
            <Text style={{ fontFamily: 'PoppinsSemiBold', fontSize: RFValue(30), color: 'white' }}>1 - 5</Text>
          </View>
          <View style={styles.live_col_thr}>
            <View style={styles.live_circle}></View>
            <Text style={{ marginTop: 10, fontFamily: 'Poppins', fontSize: RFValue(15), color: 'white' }}>Team {'\n'}Name</Text >
          </View>
        </ImageBackground>
        <View style={styles.upcoming}>
          <Text style={{ fontFamily: 'PoppinsSemiBold', fontSize: RFValue(26), color: '#2C0735' }}>Upcoming</Text>
          <View></View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dash_container: {
    paddingVertical: RFValue(15),
    paddingHorizontal: RFValue(10),
    backgroundColor: 'white',
    flexDirection: 'column',
    flex: 1

  },
  dash_cont_two: {
    paddingVertical: RFValue(5),
    paddingHorizontal: RFValue(18),
    backgroundColor: 'white',
    flexDirection: 'column',
    alignSelf: 'stretch', // full width
    flex: 1
  },

  hmenu_cont: {
    backgroundColor: 'white',
    alignSelf: 'stretch',
    marginBottom: RFValue(12),
    marginHorizontal: RFValue(10),

  },
  line_gradient: {
    alignSelf: 'stretch',
    height: RFValue(4),
    marginBottom: RFValue(45),

  },
  top_bar: {
    marginTop: RFValue(48),
    display: 'flex',
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: RFValue(25),

  },
  right_group: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // or use margin for spacing
  },
  top_baric_one: {
    alignSelf: 'center',
    width: RFValue(24),
    height: RFValue(24),
  },
  top_baric_two: {
    alignSelf: 'center',
    width: RFValue(25),
    height: RFValue(25),

  },
  profile_border: {
    padding: RFValue(6), // 👈 controls the border offset
    borderWidth: 1,
    borderColor: '#613DC1',
    borderRadius: 8,
  },
  top_baric_thr: {
    alignSelf: 'center',
    width: RFValue(33),
    height: RFValue(30),
  },
  iconWrapper: {
    marginHorizontal: RFValue(6),
    paddingVertical: RFValue(4),

  },

  iconInner: {
    padding: RFValue(8),
    borderWidth: RFValue(2),
    borderColor: "transparent",
    borderRadius: RFValue(12),
    backgroundColor: "white",
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedIcon: {
    borderColor: "#2c91a1", // Highlight color
    borderWidth: 0,
    borderBottomWidth: 8,
  },

  iconImage: {
    width: 40,
    height: 40,
  },
  live_cont: {
    display: 'flex',
    alignSelf: 'stretch',
    height: RFValue(180),
    flexDirection: 'row',
    columnGap: RFValue(30),
    justifyContent: 'center',
    marginBottom: 20
  },
  live_col_one: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center'
  },
  live_col_two: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    rowGap: RFValue(10),
  },
  live_tag: {
    flexDirection: 'row',
    backgroundColor: '#613DC1',
    justifyContent: 'center',
    alignItems: 'center',
    width: RFValue(74),
    height: RFValue(26),
    borderRadius: 11,
    columnGap: RFValue(5)
  },
  sm_circle: {
    borderRadius: '50%',
    backgroundColor: '#97DFFC',
    width: RFValue(8),
    height: RFValue(8),
  },
  live_col_thr: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  live_circle: {
    borderRadius: '50%',
    backgroundColor: '#D9D9D9',
    width: RFValue(75),
    height: RFValue(75),
  },
  upcoming: {
    flex: 1,
    flexDirection: 'column'
  }
});
