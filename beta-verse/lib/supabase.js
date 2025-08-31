// lib/supabase.js
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

function getExtra() {
  return (
    Constants?.expoConfig?.extra ??
    Constants?.manifest2?.extra ??
    Constants?.manifest?.extra ??
    {}
  );
}
const extra = getExtra();

export const SUPABASE_URL =
  extra.SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";

export const SUPABASE_ANON_KEY =
  extra.SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

// Derive Functions base if not provided (iOS requires https:)
const fromExtraOrEnv = (extra.FUNCTIONS_URL || process.env.FUNCTIONS_URL || "").replace(/\/+$/, "");
const fallbackFromSupabase =
  (typeof SUPABASE_URL === "string" && SUPABASE_URL.startsWith("http"))
    ? `https://${new URL(SUPABASE_URL).host}.functions.supabase.co`
    : "";
export const FUNCTIONS_BASE = fromExtraOrEnv || fallbackFromSupabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
