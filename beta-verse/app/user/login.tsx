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
import { useAuth } from "@/hooks/AuthContext"; // ✅ your context

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
  const [busy, setBusy] = useState(false);

  const { signIn } = useAuth();

  const handleLogin = async () => {
    // light guard so we don’t flash an auth call with empty fields
    const e = email.trim();
    if (!e || !password) {
      alert("Enter your email and password.");
      return;
    }
    try {
      setBusy(true);
      await signIn(e, password);
      router.replace("/(tabs)");
    } catch (error: any) {
      alert(error?.message ?? "Login failed. Try again.");
    } finally {
      setBusy(false);
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scroll_container}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.log_contain}>
              {/* Back */}
              <TouchableOpacity onPress={() => router.push("/user")} style={styles.back_btn}>
                <Image
                  style={styles.back_img}
                  source={require("@/assets/images/back.png")}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              {/* Titles */}
              <Text style={styles.log_sub}>Welcome</Text>
              <Text style={styles.log_head}>Back</Text>

              {/* Logo */}
              <View style={styles.log_img_cont}>
                <Image
                  style={styles.logo}
                  source={require("@/assets/images/logo.png")}
                  resizeMode="contain"
                />
              </View>

              {/* Inputs */}
              <View style={styles.log_input_cont}>
                <View style={styles.email_cont}>
                  <TextInput
                    style={styles.log_input}
                    placeholder="Email Address"
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
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
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                  <Image
                    style={styles.pw_img}
                    source={require("@/assets/images/LockIcon.png")}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* CTA */}
              <TouchableOpacity onPress={handleLogin} style={[styles.login_btn, busy && { opacity: 0.8 }]} disabled={busy}>
                <Text style={styles.log_btn_text}>{busy ? "Logging in..." : "Log in ->"}</Text>
              </TouchableOpacity>

              {/* Footer link(s) */}
              <View style={styles.footer_links}>
                <TouchableOpacity onPress={() => router.push("/user/confirm")}>
                  <Text style={styles.forgot_text}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push("/user/singup")} style={{ marginTop: RFValue(8) }}>
                  <Text style={styles.create_text}>Create an account</Text>
                </TouchableOpacity>
              </View>
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
    paddingHorizontal: RFValue(26), // a touch tighter than 28
    paddingTop: RFValue(56),       // was 80; gives more breathing room overall
    paddingBottom: RFValue(28),
    justifyContent: "flex-start",
  },

  // Titles
  log_sub: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(22), // slightly smaller for balance with "Back"
    color: "white",
    marginBottom: RFValue(2),
  },
  log_head: {
    fontFamily: "PoppinsSemiBold",
    fontSize: RFValue(44),
    color: "white",
    marginBottom: RFValue(10),
    lineHeight: RFValue(46),
  },

  // Logo
  log_img_cont: {
    width: "100%",
    alignItems: "center",
    marginBottom: RFValue(8), // give inputs a little air
  },
  logo: {
    width: RFValue(220),  // slightly smaller so the header area feels less cramped
    height: RFValue(160),
  },

  // Inputs
  log_input_cont: {
    width: "100%",
    marginTop: RFValue(8),
  },
  email_cont: {
    position: "relative",
    marginBottom: RFValue(12),
  },
  log_input: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(16),
    width: "100%",
    height: RFValue(50),
    paddingHorizontal: RFValue(15),
    paddingRight: RFValue(45), // space for icon
    borderBottomWidth: RFValue(1.6), // slightly thinner underline
    borderColor: "white",
    borderRadius: RFValue(8),
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "white",
  },
  email_img: {
    width: RFValue(20),
    height: RFValue(20),
    position: "absolute",
    right: RFValue(15),
    top: RFValue(15),
  },
  pw_cont: {
    position: "relative",
  },
  pw_input: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(16),
    width: "100%",
    height: RFValue(50),
    paddingHorizontal: RFValue(15),
    paddingRight: RFValue(45), // space for icon
    borderBottomWidth: RFValue(1.6),
    borderColor: "white",
    borderRadius: RFValue(8),
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "white",
  },
  pw_img: {
    width: RFValue(20),
    height: RFValue(20),
    position: "absolute",
    right: RFValue(15),
    top: RFValue(15),
  },

  // Back button
  back_btn: { width: RFValue(98), height: RFValue(40), marginBottom: RFValue(18) },
  back_img: { width: "100%", height: "100%" },

  // CTA
  login_btn: {
    marginTop: RFValue(22), // tightened so button sits closer to inputs
    borderRadius: RFValue(16),
    width: "100%",
    height: RFValue(55),
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  log_btn_text: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(18),
    color: "black",
  },

  // Footer
  footer_links: {
    marginTop: RFValue(16),
    alignItems: "center",
    justifyContent: "center",
  },
  forgot_text: {
    textDecorationLine: "underline",
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(14),
    color: "white",
  },
  create_text: {
    fontFamily: "PoppinsMedium",
    fontSize: RFValue(14),
    color: "white",
  },
});
