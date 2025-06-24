import {
  StyleSheet,
  Text,
  View,
  Image,
  ImageBackground,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { RFValue } from "react-native-responsive-fontsize";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withDelay,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

export default function Login() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  // Animation values
  const slideX = useSharedValue(-50);      // For both texts
  const fadeIn = useSharedValue(0);        // For both texts
  const floatY = useSharedValue(0);        // Only for "World"


  useEffect(() => {
    // Both texts slide in and fade in
    slideX.value = withTiming(0, {
      duration: 1800,
      easing: Easing.out(Easing.exp),
    });

    fadeIn.value = withTiming(2000, {
      duration: 1000,
      easing: Easing.out(Easing.ease),
    });

    // "World" starts floating AFTER slide-in
    floatY.value = withDelay(
      1000,
      withRepeat(
        withTiming(-10, {
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      )
    );
  }, []);

  const animatedTextSharedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: fadeIn.value,
  }));

  const animatedWorldStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }, { translateY: floatY.value }],
    opacity: fadeIn.value,
  }));


  const textShadowStyle = {
    textShadowColor: "rgba(255, 255, 255, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/splash.png")}
      resizeMode="cover"
      style={styles.log_bg}
    >
      <View style={styles.log_contain}>
        <Animated.Text style={[styles.log_sub, animatedTextSharedStyle]}>
          You vs. the
        </Animated.Text>

        <Animated.Text style={[styles.log_head, animatedWorldStyle, textShadowStyle]}>
          World
        </Animated.Text>

        <View style={styles.log_img_cont}>
          <Image
            style={styles.logo}
            source={require("@/assets/images/logo.png")}
            resizeMode="contain"
          />
        </View>

        <View style={styles.welc_cont}>
          <Text style={styles.log_welc}>Welcome</Text>
          <Text style={styles.login_text}>
            🏆 Welcome to LuxeBets 🏆
            Get ready to experience the thrill of the game like never before!...ff! 🚀🔥.
          </Text>
        </View>

        <TouchableOpacity onPress={() => router.push("/user/login")} style={styles.login_btn}>
          <Text style={styles.log_btn_text}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/user/singup")} style={styles.create_cont}>
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
  },
  logo: {
    width: width * 0.9,
    height: height * 0.3,
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
