// app/admin/_layout.tsx
import React from "react";
import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";

export default function AdminLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/user/login" />;
  }

  const isAdmin =
    user?.user_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";

  if (!isAdmin) {
    return <Redirect href="/(tabs)/wallet" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Admin Dashboard / Menu */}
      <Stack.Screen name="index" />

      {/* Withdrawals module */}
      <Stack.Screen name="withdrawals" />

      {/* Referrals module */}
      <Stack.Screen name="referrals" />

      {/* NEW: Grade Games */}
      <Stack.Screen name="grade_games" />
    </Stack>
  );
}
