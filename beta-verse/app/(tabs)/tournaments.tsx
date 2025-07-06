import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native'
import React from 'react'
import { RFValue } from "react-native-responsive-fontsize";
import { useFonts } from 'expo-font';

const tournamentData = [
  {
    id: 1,
    entry: '$20 Entry',
    date: 'June 28 – 30',
    players: 12,
    prize: 680,
    status: 'Active',
  },
  {
    id: 2,
    entry: '$50 Entry',
    date: 'June 28 – 30',
    players: 12,
    prize: 680,
    status: 'Active',
  },
  {
    id: 3,
    entry: '$100 Entry',
    date: 'June 28 – 30',
    players: 12,
    prize: 680,
    status: 'Active',
  },
];
const tournaments = () => {
  const [fontsLoaded] = useFonts({
    Poppins: require('@/assets/fonts/Poppins-Regular.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf'),
    PoppinsSemiBold: require('@/assets/fonts/Poppins-SemiBold.ttf'),
    PoppinsBold: require('@/assets/fonts/Poppins-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <View style={styles.tour_cont}>
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
      <View>
        <Text style={{ fontFamily: 'PoppinsSemiBold', fontSize: RFValue(30), color: '#2C0735' }}>Tournaments</Text>
        <View>
          {tournamentData.map((item) => (
            <View key={item.id} style={styles.tour_card}>
              <View style={styles.tour_row_one}>
                <Image style={{ width: RFValue(35), height: RFValue(42) }} source={require('@/assets/icons/trophy.png')} />
                <View style={{ flexDirection: 'column' }}>
                  <Text style={{ fontFamily: 'PoppinsMedium', fontSize: RFValue(16), color: '#2C0735' }}>{item.entry}</Text>
                  <Text style={{ marginTop: RFValue(-4), fontFamily: 'PoppinsRegular', fontSize: RFValue(12), color: '#2C0735' }}>{item.date}</Text>
                </View>

              </View>
              <View style={styles.tour_row_two}>
                <View style={{ flexDirection: 'column', width: '65%' }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Image style={{ width: RFValue(20), height: RFValue(20) }} source={require('@/assets/icons/miniperson.png')} />
                    <Text style={{ fontFamily: 'PoppinsRegular', fontSize: RFValue(12), color: '#2C0735' }}>{item.players} Players Joined</Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <Image style={{ width: RFValue(20), height: RFValue(20) }} source={require('@/assets/icons/minicoin.png')} />
                    <Text style={{ fontFamily: 'PoppinsRegular', fontSize: RFValue(12), color: '#2C0735' }}>Prize Pool: ${item.prize}</Text>
                  </View>
                </View>
                <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', borderRadius: 6, width: RFValue(88), height: RFValue(31), backgroundColor: '#613DC1' }}>
                  <Text style={{ fontFamily: 'PoppinsSemiBold', fontSize: RFValue(12), color: '#FFFFFF' }}>Join</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tour_row_thr}>
                <View style={styles.sm_circle}></View>
                <Text style={{ fontFamily: 'PoppinsRegular', fontSize: RFValue(13), color: '#97DFFC', fontWeight: 800 }}>{item.status}</Text>

              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

export default tournaments

const styles = StyleSheet.create({
  tour_cont: {
    paddingVertical: RFValue(15),
    paddingHorizontal: RFValue(10),
    backgroundColor: 'white',
    flexDirection: 'column',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'

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
  tour_card: {
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 2.21,
    borderColor: '#858AE3',
    width: RFValue(310),
    height: RFValue(168),
    padding: (RFValue(20)),
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tour_row_one: {
    flexDirection: 'row',
    width: '100%',
    columnGap: 10,
    marginBottom: RFValue(15),
  },
  tour_row_two: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    marginBottom: RFValue(15)
  },
  tour_row_thr: {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    columnGap: RFValue(8),
    alignSelf: 'center',
    justifyContent: 'flex-start'
  },
  sm_circle: {
    borderRadius: '50%',
    backgroundColor: '#97DFFC',
    width: RFValue(9),
    height: RFValue(9),
    marginTop: 'auto',
    marginBottom: 'auto'
  },
})