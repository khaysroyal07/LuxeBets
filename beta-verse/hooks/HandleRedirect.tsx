import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

export default function HandleRedirect() {
  const router = useRouter();

  useEffect(() => {
    const handleDeepLink = async (event) => {
      const { queryParams } = Linking.parse(event.url);
      const { code } = queryParams;

      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('Exchange error:', error);
          } else {
            router.replace('/'); // or navigate to your home screen
          }
        } catch (err) {
          console.error('Deep link error:', err);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}
