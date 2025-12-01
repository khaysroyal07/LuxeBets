// hooks/HandleRedirect.tsx
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { useRouter, useRootNavigationState } from "expo-router";

export default function HandleRedirect() {
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    // Router not ready yet → do nothing
    if (!navState?.key) return;

    const handleDeepLink = async (event: Linking.EventType) => {
      try {
        const { queryParams } = Linking.parse(event.url);
        const code = (queryParams as any)?.code as string | undefined;

        if (!code) return;

        const { data, error } =
          await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Exchange error:", error);
          return;
        }

        // Now it's safe to navigate
        router.replace("/");
      } catch (err) {
        console.error("Deep link error:", err);
      }
    };

    const sub = Linking.addEventListener("url", handleDeepLink);

    return () => {
      sub.remove();
    };
  }, [navState?.key, router]);

  return null;
}
