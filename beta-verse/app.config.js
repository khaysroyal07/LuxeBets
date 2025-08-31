import "dotenv/config";

export default {
  expo: {
    name: "luxebets",
    slug: "luxebets",
    owner: "betaverse",
    privacy: "unlisted", // or "public"
    // IMPORTANT for EAS Update:
    version: "0.1.0", // bump this when you want a new runtime
    runtimeVersion: { policy: "appVersion" },
    updates: {
      // <-- this URL is tied to your projectId from EAS (yours below)
      url: "https://u.expo.dev/04856fd0-e267-439d-b824-a18348901d7f",
    },

    ios: { buildNumber: "1" },
    android: { versionCode: 1 },

    plugins: ["expo-router"],
    extra: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      PROJECT_URL: process.env.PROJECT_URL,
      ANON_KEY: process.env.ANON_KEY,
      FUNCTIONS_URL: `https://${process.env.SUPABASE_REF}.functions.supabase.co`,
      SPORTSDATAIO_KEY: process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY, // optional client usage
      SPORTSDATAIO_KEY: process.env.SPORTSDATAIO_KEY,
      eas: {
        projectId: "04856fd0-e267-439d-b824-a18348901d7f",
      },
    },
  },
};
