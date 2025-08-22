import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Dimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/AuthContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

import dashboardIcon from '@/assets/icons/home.png';
import walletIcon from '@/assets/icons/wallet.png';
import rankingsIcon from '@/assets/icons/rank.png';
import { RFValue } from "react-native-responsive-fontsize";

const { width } = Dimensions.get('window');

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
    width: RFValue(28, width),  // responsive size
    height: RFValue(28, width), // make square for even appearance
  },
});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  if (!user) return <Redirect href="/user/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#191919',
          position: 'absolute',
          borderRadius: 20,
          marginHorizontal: 30,
          paddingVertical: 0,
          marginBottom: 40,
          height: 90,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
        },
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon source={walletIcon} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon source={dashboardIcon} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: 'Tournaments',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon source={rankingsIcon} color={color} />,
        }}
      />
    </Tabs>
  );
}
