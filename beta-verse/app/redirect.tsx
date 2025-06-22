import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function RedirectScreen() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  const isAuthenticated = false; // use your auth logic

  useEffect(() => {
    // Allow root layout to mount before redirecting
    setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)');
      } else {
        router.replace('/user');
      }
      setIsReady(true);
    }, 0);
  }, []);

  // Optional loading placeholder
  return <View />;
}
