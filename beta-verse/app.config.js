// app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: "betaverse",
    slug: "betaverse",
    owner: "betaverse",
    scheme: "luxebets",
    platforms: ["ios", "android", "web"],           // <- helps the “platform constraints” check
    runtimeVersion: { policy: "sdkVersion" },       // Expo Go compatible
    updates: {
      url: "https://u.expo.dev/538a1d74-068e-425d-817d-692eff7a3423"
    },
    splash: {
      image: "./assets/images/logo.png",
      backgroundColor: "#401c45ff",
      resizeMode: "contain"
    },
    ios: { bundleIdentifier: "com.betaverse.betaverse", supportsTablet: true },
    android: {
      package: "com.betaverse.betaverse",
      adaptiveIcon: {
        foregroundImage: "./assets/images/logo.png",
        backgroundColor: "#401c45ff"
      },
      edgeToEdgeEnabled: true
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: ["expo-router", "expo-font", "expo-web-browser"],
    experiments: { typedRoutes: true },
    extra: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      FUNCTIONS_URL: process.env.FUNCTIONS_URL,
      SPORTSDATAIO_KEY: process.env.SPORTSDATAIO_KEY,
      STREAKS_URL: process.env.STREAKS_URL,
      STREAKS_API_KEY: process.env.STREAKS_API_KEY,
      eas: { projectId: "538a1d74-068e-425d-817d-692eff7a3423" }
    }
  }
};
