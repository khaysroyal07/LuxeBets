// app/wallet/checkout-complete.tsx
import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function WalletCheckoutComplete() {
  const router = useRouter();

  useEffect(() => {
    WebBrowser.dismissBrowser();
    // IMPORTANT: your tab file is app/(tabs)/wallet.tsx (lowercase),
    // so navigate to '/(tabs)/wallet' (lowercase)
    router.replace("/(tabs)/wallet");
  }, [router]);

  return <View />;
}
