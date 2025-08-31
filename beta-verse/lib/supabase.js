// lib/supabase.js
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

const extra = (Constants?.expoConfig?.extra) || {};
export const SUPABASE_URL = extra.SUPABASE_URL || process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = extra.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -> https://<ref>.functions.supabase.co
export const FUNCTIONS_BASE = SUPABASE_URL
  ? SUPABASE_URL.replace(/^https?:\/\//, "https://").replace(".supabase.co", ".functions.supabase.co")
  : "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check app.config.js / .env");
}
