import {
  StyleSheet,
  Text,
  View,
  Image,
  ImageBackground,
  TouchableOpacity,
  Dimensions,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import React, { useState } from "react";
import { useFonts } from "expo-font";
import { RFValue } from "react-native-responsive-fontsize";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/AuthContext"; // ✅ correct
const { width, height } = Dimensions.get("window");

export default function Login() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn } = useAuth();
  const handleLogin = async () => {
    try {
      await signIn(email, password);
      alert('Logged in!');
      router.push("/(tabs)");
    } catch (error) {
      alert(error.message);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/Signup.png")}
      resizeMode="cover"
      style={styles.log_bg}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scroll_container}
            keyboardShouldPersistTaps="handled"
          >

            <View style={styles.log_contain}>
              <TouchableOpacity onPress={() => router.push("/user")} style={styles.back_btn}>
                <Image
                  style={styles.back_img}
                  source={require("@/assets/images/back.png")}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <Text style={styles.log_sub}>Welcome</Text>
              <Text style={styles.log_head}>Back</Text>

              <View style={styles.log_img_cont}>
                <Image
                  style={styles.logo}
                  source={require("@/assets/images/logo.png")}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.log_input_cont}>
                <View style={styles.email_cont}>
                  <TextInput
                    style={styles.log_input}
                    placeholder="Email Address"
                    placeholderTextColor="white"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Image
                    style={styles.email_img}
                    source={require("@/assets/images/email.png")}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.pw_cont}>
                  <TextInput
                    style={styles.pw_input}
                    placeholder="Password"
                    placeholderTextColor="white"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                  <Image
                    style={styles.pw_img}
                    source={require("@/assets/images/LockIcon.png")}
                    resizeMode="contain"
                  />
                </View>
              </View>

              <TouchableOpacity onPress={handleLogin} style={styles.login_btn}>
                <Text style={styles.log_btn_text}>Log in {'->'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push("/user/singup")} style={styles.create_cont}>
                <Text style={styles.forgot_text}>Forgot Password?</Text>
              </TouchableOpacity>


            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  log_bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  scroll_container: {
    flexGrow: 1,
  },
  log_contain: {
    flex: 1,
    paddingHorizontal: RFValue(28),
    paddingTop: RFValue(80),
    justifyContent: "flex-start",
  },
  log_sub: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(25),
    color: "white",
    height: RFValue(30),

  },
  log_head: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(45),
    color: "white",
    marginBottom: RFValue(10),
  },
  log_img_cont: {
    width: "100%",
    alignItems: "center",
    marginBottom: RFValue(2),
  },
  logo: {
    width: RFValue(260),
    height: RFValue(190),
  },
  login_btn: {
    marginTop: RFValue(30),
    borderRadius: RFValue(16),
    width: "100%",
    height: RFValue(55),
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
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
  },
  forgot_text: {
    textDecorationLine: "underline",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(15),
    color: "white",
  },
  log_input_cont: {
    width: "100%",
    marginTop: RFValue(10),
  },
  email_cont: {
    position: "relative",
    marginBottom: RFValue(10),
  },
  log_input: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(16),
    width: "100%",
    height: RFValue(50),
    paddingHorizontal: RFValue(15),
    paddingRight: RFValue(45), // space for icon
    borderBottomWidth: RFValue(2),
    borderColor: "white",
    borderRadius: RFValue(8),
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "white",
    marginBottom: RFValue(10),
  },
  email_img: {
    width: RFValue(22),
    height: RFValue(22),
    position: "absolute",
    right: RFValue(15),
    top: RFValue(14),
  },
  pw_cont: {
    position: "relative",
    marginBottom: RFValue(5),
  },
  pw_input: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(16),
    width: "100%",
    height: RFValue(50),
    paddingHorizontal: RFValue(15),
    paddingRight: RFValue(45), // space for icon
    borderBottomWidth: RFValue(2),
    borderColor: "white",
    borderRadius: RFValue(8),
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "white",
  },
  pw_img: {
    width: RFValue(22),
    height: RFValue(22),
    position: "absolute",
    right: RFValue(15),
    top: RFValue(14),
  },
  back_btn: { width: RFValue(105), height: RFValue(44), marginBottom: 25 },
  back_img: { width: "100%", height: "100%", }
});
