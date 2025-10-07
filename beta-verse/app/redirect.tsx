// app/redirect.tsx
import { useRouter, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export default function RedirectScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  const isAuthenticated = false; // your auth logic

  useEffect(() => {
    // If this is the Square return path, don't run auth redirect here
    if (pathname?.includes("/wallet/checkout-complete")) {
      WebBrowser.dismissBrowser();
      router.replace("/wallet");
      return;
    }

    // Otherwise do your normal redirect
    setTimeout(() => {
      if (isAuthenticated) router.replace("/(tabs)");
      else router.replace("/user");
      setIsReady(true);
    }, 0);
  }, [pathname, router]);

  return <View />;
}
