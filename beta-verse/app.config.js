import 'dotenv/config';

export default {
  expo: {
    name: "beta-verse",
    slug: "beta-verse",
    
    extra: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      PROJECT_URL: process.env.PROJECT_URL,
      ANON_KEY: process.env.ANON_KEY,
      FUNCTIONS_URL: `https://${process.env.SUPABASE_REF}.functions.supabase.co`,
      SPORTSDATAIO_KEY: process.env.EXPO_PUBLIC_SPORTSDATAIO_KEY, // optional client usage
      SPORTSDATAIO_KEY: process.env.SPORTSDATAIO_KEY,
    },
  },
};
