import 'dotenv/config';

export default {
  expo: {
    name: "beta-verse",
    slug: "beta-verse",
    extra: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    },
  },
};
