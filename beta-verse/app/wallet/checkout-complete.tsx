import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function WalletCheckoutComplete() {
  const router = useRouter();

  useEffect(() => {
    WebBrowser.dismissBrowser();
    router.replace("/(tabs)/wallet");
  }, [router]);

  return <View />;
}
