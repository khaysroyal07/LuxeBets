// app/admin/_layout.tsx
import React from "react";
import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";

export default function AdminLayout() {
  const { user } = useAuth();

  // No user? → login
  if (!user) {
    return <Redirect href="/user/login" />;
  }

  const isAdmin =
    user?.user_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";

  // Logged in but not admin? → push back into main app
  if (!isAdmin) {
    return <Redirect href="/(tabs)/wallet" />;
  }

  // Admin only stack
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="withdrawals" />
    </Stack>
  );
}
