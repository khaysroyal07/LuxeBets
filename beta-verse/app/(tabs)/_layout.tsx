// app/(tabs)/_layout.tsx
import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Tabs, Redirect } from "expo-router";
import { RFValue } from "react-native-responsive-fontsize";

import { useAuth } from "@/hooks/AuthContext";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";

import dashboardIcon from "@/assets/icons/home.png";
import walletIcon from "@/assets/icons/wallet.png";
import rankingsIcon from "@/assets/icons/rank.png";

const { width } = Dimensions.get("window");

function TabBarIcon({
  source,
  color,
}: {
  source: ImageSourcePropType;
  color: string;
}) {
  return (
    <Image
      source={source}
      style={[styles.icon, { tintColor: color }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    marginTop: "50%",
    margin: "auto" as any,
    width: RFValue(20, width),
    height: RFValue(20, width),
  },
});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  // Not logged in? → login screen
  if (!user) return <Redirect href="/user/login" />;

  // 🔑 Check admin flag (adjust to match how you’re storing it)
  const isAdmin =
    user?.user_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";

  // If admin logged in, DO NOT show tabs → send to admin area only
  if (isAdmin) {
    return <Redirect href="/admin" />;
  }

  // Normal player → show tabs
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#191919",
          position: "absolute",
          borderRadius: 20,
          width: "90%",
          marginBottom: 40,
          marginLeft: "5%",
          height: 90,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color }) => (
            <TabBarIcon source={walletIcon} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <TabBarIcon source={dashboardIcon} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: "Tournaments",
          tabBarIcon: ({ color }) => (
            <TabBarIcon source={rankingsIcon} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
