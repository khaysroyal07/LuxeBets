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

/**
 * Edge Functions base URL
 * Priority:
 *   1) extra.FUNCTIONS_BASE / extra.FUNCTIONS_URL / env
 *   2) fall back to `${SUPABASE_URL}/functions/v1`
 */
const rawFunctionsBase =
  extra.FUNCTIONS_BASE ??
  extra.FUNCTIONS_URL ??
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ??
  process.env.FUNCTIONS_BASE ??
  "";

let functionsBase = rawFunctionsBase.replace(/\/+$/, "");

if (!functionsBase && SUPABASE_URL) {
  // default to standard supabase pattern
  const cleaned = SUPABASE_URL.replace(/\/+$/, "");
  functionsBase = `${cleaned}/functions/v1`;
}

export const FUNCTIONS_BASE = functionsBase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
