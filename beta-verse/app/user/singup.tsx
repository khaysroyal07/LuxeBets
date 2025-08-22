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
import { useAuth } from '@/hooks/AuthContext';

const { width, height } = Dimensions.get("window");

export default function SignUp() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins: require("@/assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("@/assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("@/assets/fonts/Poppins-SemiBold.ttf"),
    PoppinsBold: require("@/assets/fonts/Poppins-Bold.ttf"),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signUp } = useAuth();
    const handleSignUp = async () => {
    try {
      await signUp(email, password);
      alert('Signned Up completed!');
      router.push("/user/confirm");
    } catch (error) {
      alert(error.message);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require("@/assets/images/Signup.png")}
      resizeMode="cover"
      style={styles.sign_bg}
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

            <View style={styles.sign_contain}>
              <TouchableOpacity onPress={() => router.push("/user")} style={styles.back_btn}>
                <Image
                  style={styles.back_img}
                  source={require("@/assets/images/back.png")}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <Text style={styles.sign_sub}>Let's</Text>
              <Text style={styles.sign_head}>Start</Text>



              <View style={styles.sign_input_cont}>
                <View style={styles.email_cont}>
                  <TextInput
                    style={styles.sign_input}
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

              <TouchableOpacity  onPress={handleSignUp} style={styles.signin_btn}>
                <Text style={styles.sign_btn_text}>Sign Up {'->'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.create_cont}>
                <Text style={styles.terms_text}>Terms and Conditions</Text>
              </TouchableOpacity>


            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  sign_bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  scroll_container: {
    flexGrow: 1,
  },
  sign_contain: {
    flex: 1,
    paddingHorizontal: RFValue(28),
    paddingTop: RFValue(80),
    justifyContent: "flex-start",
  },
  sign_sub: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(25),
    color: "white",
    height: RFValue(30),

  },
  sign_head: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(45),
    color: "white",
    marginBottom: RFValue(10),
  },
  sign_img_cont: {
    width: "100%",
    alignItems: "center",
    marginBottom: RFValue(2),
  },
  signo: {
    width: RFValue(260),
    height: RFValue(190),
  },
  signin_btn: {
    marginTop: RFValue(30),
    borderRadius: RFValue(16),
    width: "100%",
    height: RFValue(55),
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  sign_btn_text: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(18),
    color: "black",
  },
  create_cont: {
    marginTop: RFValue(18),
    alignItems: "center",
    justifyContent: "center",
  },
  terms_text: {
    textDecorationLine: "underline",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(15),
    color: "white",
  },
  sign_input_cont: {
    width: "100%",
    marginTop: RFValue(180),
  },
  email_cont: {
    position: "relative",
    marginBottom: RFValue(10),
  },
  sign_input: {
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
