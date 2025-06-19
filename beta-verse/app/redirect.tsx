import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth'; // replace with your logic

export default function RedirectScreen() {
  const isAuthenticated = false; // useAuth() in production

  if (isAuthenticated === null) return null;

  return isAuthenticated ? (
    <Redirect href="/(tabs)" />
  ) : (
    <Redirect href="/user" />
  );
}
