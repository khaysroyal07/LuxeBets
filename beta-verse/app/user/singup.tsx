import {
  StyleSheet,
  Text,
  View,
  Image as RNImage,
  ImageBackground,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import React, { useEffect } from "react";
import { useFonts } from "expo-font";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";

export default function SignUp() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });


  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/Signup.png")}
      resizeMode="cover"
      style={styles.log_bg}
    >
      <View style={styles.log_contain}>

        <View style={styles.welc_cont}>
          <Text style={styles.log_welc}>Welcome</Text>
          <Text style={styles.login_text}>
            Beta Verse is your place to compete against the world. Beta Verse is your place to shine.
          </Text>
        </View>

        <TouchableOpacity style={styles.login_btn}>
          <Text style={styles.log_btn_text}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.create_cont}>
          <Text style={styles.create_text}>Create a new account</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  log_bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  log_contain: {
    flex: 1,
    paddingHorizontal: RFValue(24),
    paddingTop: RFValue(60),
    justifyContent: "flex-start",
  },
  log_sub: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(32),
    color: "white",
    marginBottom: RFValue(0),
    height: 40,
  },
  log_head: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(54),
    color: "white",
    marginBottom: RFValue(20),
  },
  log_img_cont: {
    width: "100%",
    alignItems: "center",
    marginBottom: RFValue(15),
    overflow: "visible",
  },
  logo: {
    width: 200,
    height: 200,
    backfaceVisibility: "hidden",
  },
  welc_cont: {
    alignSelf: "stretch",
    marginBottom: RFValue(5),
  },
  log_welc: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(34),
    color: "white",
    marginBottom: RFValue(8),
  },
  login_text: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(15),
    color: "white",
    maxWidth: "100%",
  },
  login_btn: {
    marginTop: RFValue(30),
    borderRadius: RFValue(16),
    height: RFValue(60),
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  log_btn_text: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(18),
    color: "black",
  },
  create_cont: {
    marginTop: RFValue(18),
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  create_text: {
    textDecorationLine: "underline",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(15),
    color: "white",
  },
});
