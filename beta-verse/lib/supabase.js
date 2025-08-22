import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = Constants.expoConfig.extra;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
