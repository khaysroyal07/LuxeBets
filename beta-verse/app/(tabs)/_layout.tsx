import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Platform } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/AuthContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

import dashboardIcon from '@/assets/icons/dash.png';
import walletIcon from '@/assets/icons/wallet.png';
import rankingsIcon from '@/assets/icons/rank.png';

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
    width: 42,
    height: 36,
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
          backgroundColor: '#416985',
          position: Platform.OS === 'ios' ? 'absolute' : 'relative',
          borderRadius: 20,
          marginHorizontal: 30,
          paddingVertical: 0,
          marginBottom: 20,
          height: 90,
          display: 'flex',
          justifyContent: 'center',   // center horizontally
          alignItems: 'center',       // center vertically
          flexDirection: 'row',

        },



      }}
    >
      {/* Switched order: wallet first */}
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
